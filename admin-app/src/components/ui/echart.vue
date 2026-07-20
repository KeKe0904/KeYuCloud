<template>
  <view class="echart-wrap" :id="chartId">
    <!-- #ifdef H5 -->
    <view :id="chartDomId" class="echart-dom" :style="{ width, height }"></view>
    <!-- #endif -->
    <!-- #ifndef H5 -->
    <image v-if="inited" class="echart-img" :src="dataUrl" mode="aspectFit" :style="{ width, height }" />
    <!-- #endif -->
  </view>
</template>

<script>
/**
 * 简易图表组件
 * - H5: 使用 ECharts 动态渲染
 * - App/小程序: 渲染为静态 SVG 图 (折线/柱状/环图)
 */
let echarts;
let uid = 0;

export default {
  name: 'EChart',
  props: {
    type: { type: String, default: 'line' }, // line | bar | donut
    width: { type: String, default: '100%' },
    height: { type: String, default: '400rpx' },
    series: { type: Array, default: () => [] }, // [{name, data}]
    categories: { type: Array, default: () => [] },
    colors: { type: Array, default: () => [] },
    smooth: { type: Boolean, default: true },
    donut: { type: Boolean, default: false },
  },
  data() {
    return {
      chartId: 'echart_' + (++uid),
      chartDomId: 'echart_dom_' + uid,
      inited: false,
      dataUrl: '',
      chart: null,
    };
  },
  watch: {
    series: { handler: 'render', deep: true },
    categories: { handler: 'render', deep: true },
  },
  mounted() {
    this.$nextTick(() => this.render());
  },
  beforeUnmount() {
    if (this.chart) {
      this.chart.dispose();
      this.chart = null;
    }
  },
  methods: {
    async render() {
      // #ifdef H5
      if (!echarts) {
        echarts = await import('echarts');
      }
      this.$nextTick(() => {
        const dom = document.getElementById(this.chartDomId);
        if (!dom) return;
        if (this.chart) this.chart.dispose();
        this.chart = echarts.init(dom, null, { renderer: 'svg' });
        this.chart.setOption(this.buildOption());
      });
      // #endif
      // #ifndef H5
      this.dataUrl = this.buildSvg();
      this.inited = true;
      // #endif
    },
    buildOption() {
      const colors = this.colors.length ? this.colors : ['#18181b', '#a1a1aa', '#71717a', '#52525b', '#3f3f46'];
      if (this.type === 'donut') {
        return {
          color: colors,
          tooltip: { trigger: 'item' },
          legend: { bottom: 0, textStyle: { fontSize: 11, color: '#71717a' } },
          series: [
            {
              type: 'pie',
              radius: ['45%', '70%'],
              center: ['50%', '45%'],
              avoidLabelOverlap: true,
              label: { show: false },
              labelLine: { show: false },
              data: this.series[0] ? this.series[0].data.map((v, i) => ({ name: this.categories[i] || `项${i + 1}`, value: v })) : [],
            },
          ],
        };
      }
      return {
        color: colors,
        grid: { top: 20, left: 30, right: 20, bottom: 30 },
        tooltip: { trigger: 'axis' },
        xAxis: {
          type: 'category',
          data: this.categories,
          axisLabel: { fontSize: 10, color: '#71717a' },
          axisLine: { lineStyle: { color: '#e4e4e7' } },
          axisTick: { show: false },
        },
        yAxis: {
          type: 'value',
          axisLabel: { fontSize: 10, color: '#71717a' },
          splitLine: { lineStyle: { color: '#f4f4f5' } },
          axisLine: { show: false },
        },
        series: this.series.map((s, i) => ({
          name: s.name,
          type: this.type === 'bar' ? 'bar' : 'line',
          data: s.data,
          smooth: this.smooth,
          symbol: 'circle',
          symbolSize: 6,
          showSymbol: false,
          lineStyle: { width: 2 },
          areaStyle: this.series.length === 1 ? { opacity: 0.1 } : undefined,
        })),
      };
    },
    buildSvg() {
      // 朴素静态 SVG 图 (app/小程序兜底)
      const w = 600, h = 200;
      const colors = this.colors.length ? this.colors : ['#18181b', '#a1a1aa', '#71717a', '#52525b', '#3f3f46'];
      if (this.type === 'donut') {
        const data = this.series[0] ? this.series[0].data : [];
        const total = data.reduce((s, v) => s + v, 0) || 1;
        let acc = 0;
        const cx = 100, cy = 100, r1 = 40, r2 = 65;
        const arcs = data.map((v, i) => {
          const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
          acc += v;
          const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
          const large = end - start > Math.PI ? 1 : 0;
          const x1 = cx + r2 * Math.cos(start);
          const y1 = cy + r2 * Math.sin(start);
          const x2 = cx + r2 * Math.cos(end);
          const y2 = cy + r2 * Math.sin(end);
          const x3 = cx + r1 * Math.cos(end);
          const y3 = cy + r1 * Math.sin(end);
          const x4 = cx + r1 * Math.cos(start);
          const y4 = cy + r1 * Math.sin(start);
          return `<path d="M${x1} ${y1} A${r2} ${r2} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${r1} ${r1} 0 ${large} 0 ${x4} ${y4} Z" fill="${colors[i % colors.length]}"/>`;
        });
        // 图例
        const legend = this.categories.map((c, i) => {
          const y = 20 + i * 22;
          return `<rect x="220" y="${y - 8}" width="12" height="12" fill="${colors[i % colors.length]}"/><text x="240" y="${y + 2}" font-size="12" fill="#525252">${c}</text>`;
        });
        return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${arcs.join('')}${legend.join('')}</svg>`)}`;
      }
      // 折线/柱状
      const all = this.series.flatMap((s) => s.data);
      if (!all.length) return '';
      const max = Math.max(...all, 1);
      const min = Math.min(...all, 0);
      const range = max - min || 1;
      const padX = 30, padY = 20;
      const innerW = w - padX * 2;
      const innerH = h - padY * 2;
      const stepX = this.categories.length > 1 ? innerW / (this.categories.length - 1) : 0;
      const lines = this.series.map((s, si) => {
        const pts = s.data.map((v, i) => {
          const x = padX + i * stepX;
          const y = padY + innerH - ((v - min) / range) * innerH;
          return `${x},${y}`;
        });
        const color = colors[si % colors.length];
        const areaFill = this.series.length === 1
          ? `<polygon points="${padX},${padY + innerH} ${pts.join(' ')} ${padX + (s.data.length - 1) * stepX},${padY + innerH}" fill="${color}" opacity="0.1"/>`
          : '';
        return `${areaFill}<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>${pts.map((p) => { const [x, y] = p.split(','); return `<circle cx="${x}" cy="${y}" r="3" fill="${color}"/>`; }).join('')}`;
      });
      const xLabels = this.categories.map((c, i) => `<text x="${padX + i * stepX}" y="${h - 4}" font-size="9" fill="#71717a" text-anchor="middle">${c}</text>`).join('');
      return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${lines.join('')}${xLabels}</svg>`)}`;
    },
  },
};
</script>

<style scoped>
.echart-wrap { width: 100%; }
.echart-dom { width: 100%; }
.echart-img { display: block; }
</style>
