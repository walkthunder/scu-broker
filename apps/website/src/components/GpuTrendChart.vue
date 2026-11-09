<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { GpuSeries } from '../data/board';

const props = defineProps<{
  series: GpuSeries[];
  labels: string[];
}>();

const plotW = 640;
const plotH = 260;
const pad = { l: 8, r: 12, t: 20, b: 10 };

const root = ref<HTMLElement | null>(null);
const plot = ref<HTMLElement | null>(null);
const plotWidth = ref(360);
const progress = ref(0);
let frame = 0;
let observer: IntersectionObserver | undefined;
let resizeObserver: ResizeObserver | undefined;

const extent = computed(() => {
  const values = props.series.flatMap((item) => item.values);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return { min: min - span * 0.22, max: max + span * 0.2 };
});

function xAt(index: number, count: number) {
  if (count <= 1) return pad.l;
  return pad.l + (index / (count - 1)) * (plotW - pad.l - pad.r);
}

function yAt(value: number) {
  const { min, max } = extent.value;
  return pad.t + (1 - (value - min) / (max - min)) * (plotH - pad.t - pad.b);
}

function lineOf(values: number[], t: number): Array<[number, number]> {
  const count = values.length;
  const pos = Math.max(0, Math.min(1, t)) * (count - 1);
  const index = Math.floor(pos);
  const frac = pos - index;
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= index; i += 1) points.push([xAt(i, count), yAt(values[i])]);
  if (index < count - 1) {
    const value = values[index] + (values[index + 1] - values[index]) * frac;
    const x = xAt(index, count) + (xAt(index + 1, count) - xAt(index, count)) * frac;
    points.push([x, yAt(value)]);
  }
  return points;
}

function toPath(points: Array<[number, number]>) {
  return points.map((point, index) => `${index ? 'L' : 'M'}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(' ');
}

const drawn = computed(() =>
  props.series.map((item) => {
    const points = lineOf(item.values, progress.value);
    return {
      ...item,
      d: toPath(points),
      head: points[points.length - 1],
      last: item.values[item.values.length - 1],
    };
  }),
);

const yTicks = computed(() => {
  const { min, max } = extent.value;
  const step = 4;
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let value = start; value <= max + 0.01; value += step) {
    ticks.push({ label: String(value), y: yAt(value) });
  }
  return ticks;
});

function markerIndexes(count: number, width: number) {
  const last = count - 1;
  if (last <= 0) return [0];
  const inner = width * ((plotW - pad.l - pad.r) / plotW);
  const minGap = 72;
  let stride = last;
  for (let step = 1; step <= last; step += 1) {
    if ((inner / last) * step >= minGap) {
      stride = step;
      break;
    }
  }
  const start = last % stride;
  const indexes = [];
  for (let index = start; index <= last; index += stride) indexes.push(index);
  return indexes;
}

const markedIndexes = computed(() => markerIndexes(props.labels.length, plotWidth.value));

const xTicks = computed(() => {
  const count = props.labels.length;
  return markedIndexes.value.map((index) => ({
    label: props.labels[index],
    index,
    x: xAt(index, count),
  }));
});

const markers = computed(() => {
  const count = props.labels.length;
  const reached = progress.value * (count - 1);
  return props.series.flatMap((item) =>
    markedIndexes.value
      .filter((index) => index <= reached + 0.001)
      .map((index) => ({
        key: `${item.id}-${index}`,
        color: item.color,
        value: item.values[index].toFixed(2),
        x: xAt(index, count),
        y: yAt(item.values[index]),
        index,
        edge: markerEdge(index, count),
      })),
  );
});

function markerEdge(index: number, count: number): 'start' | 'end' | 'mid' {
  if (index === 0) return 'start';
  if (index === count - 1) return 'end';
  return 'mid';
}

function markerClass(edge: 'start' | 'end' | 'mid') {
  if (edge === 'end') return 'pointer-events-none absolute -translate-x-full -translate-y-full text-[11px] font-medium tabular-nums';
  if (edge === 'start') return 'pointer-events-none absolute -translate-y-full text-[11px] font-medium tabular-nums';
  return 'pointer-events-none absolute -translate-x-1/2 -translate-y-full text-[11px] font-medium tabular-nums';
}

const summary = computed(() => {
  const parts = props.series.map((item) => {
    const last = item.values[item.values.length - 1] ?? 0;
    return `${item.name} ${last.toFixed(2)}`;
  });
  return `近 12 期演示走势，${parts.join('，')}`;
});

function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function measurePlot() {
  const width = plot.value?.clientWidth;
  if (width) plotWidth.value = width;
}

onMounted(() => {
  measurePlot();
  if (plot.value) {
    resizeObserver = new ResizeObserver(measurePlot);
    resizeObserver.observe(plot.value);
  }
  const node = root.value;
  if (!node) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    progress.value = 1;
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer?.disconnect();
      const start = performance.now();
      const duration = 2600;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        progress.value = ease(t);
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    },
    { threshold: 0.25 },
  );
  observer.observe(node);
});

onUnmounted(() => {
  cancelAnimationFrame(frame);
  observer?.disconnect();
  resizeObserver?.disconnect();
});

function tickShift(_index: number) {
  return '-50%';
}
</script>

<template>
  <div ref="root">
    <div class="flex">
      <div class="relative w-10 shrink-0">
        <div class="absolute inset-0">
          <span
            v-for="tick in yTicks"
            :key="tick.label"
            class="absolute right-1 -translate-y-1/2 text-[11px] text-mute"
            :style="{ top: `${(tick.y / plotH) * 100}%` }"
          >
            {{ tick.label }}
          </span>
        </div>
      </div>
      <div ref="plot" class="relative min-w-0 flex-1">
        <svg
          class="block h-auto w-full"
          :viewBox="`0 0 ${plotW} ${plotH}`"
          role="img"
          :aria-label="summary"
        >
          <line
            v-for="tick in yTicks"
            :key="tick.y"
            :x1="pad.l"
            :x2="plotW - pad.r"
            :y1="tick.y"
            :y2="tick.y"
            stroke="#2B3139"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
          <path
            v-for="item in drawn"
            :key="item.id"
            :d="item.d"
            fill="none"
            :stroke="item.color"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
          />
          <circle
            v-for="marker in markers.filter((item) => item.edge !== 'end')"
            :key="`${marker.key}-dot`"
            :cx="marker.x"
            :cy="marker.y"
            r="3"
            :fill="marker.color"
          />
          <circle
            v-for="item in drawn"
            :key="`${item.id}-head`"
            :cx="item.head[0]"
            :cy="item.head[1]"
            r="4"
            :fill="item.color"
          />
          <circle
            v-for="item in drawn"
            :key="`${item.id}-ring`"
            :cx="item.head[0]"
            :cy="item.head[1]"
            r="7"
            fill="none"
            :stroke="item.color"
            stroke-opacity="0.35"
            vector-effect="non-scaling-stroke"
          />
        </svg>
        <span
          v-for="marker in markers"
          :key="marker.key"
          :class="markerClass(marker.edge)"
          :style="{
            left: marker.edge === 'end' ? `calc(${(marker.x / plotW) * 100}% - 8px)` : `${(marker.x / plotW) * 100}%`,
            top: `calc(${(marker.y / plotH) * 100}% - 2px)`,
            color: marker.color,
          }"
        >
          {{ marker.value }}
        </span>
      </div>
    </div>
    <div class="mt-1 flex h-5">
      <div class="w-10 shrink-0" />
      <div class="relative min-w-0 flex-1">
        <span
          v-for="tick in xTicks"
          :key="tick.label"
          class="absolute w-max whitespace-nowrap text-[11px] text-mute"
          :style="{ left: `${(tick.x / plotW) * 100}%`, transform: `translateX(${tickShift(tick.index)})` }"
        >
          {{ tick.label }}
        </span>
      </div>
    </div>
  </div>
</template>
