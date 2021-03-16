import './PanelChart.less';

import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import Color from 'color';
import * as _ from 'lodash';
import * as moment from 'moment';
import humanizeDuration from 'humanize-duration';

import {
  removeOutliers,
  formatValue,
  classNames,
} from '../../../../../../../utils';
import { HubMainScreenModel } from '../../../../models/HubMainScreenModel';

const d3 = require('d3');

const circleRadius = 3;
const circleActiveRadius = 5;

const curveOptions = [
  'curveLinear',
  'curveBasis',
  'curveBundle',
  'curveCardinal',
  'curveCatmullRom',
  'curveMonotoneX',
  'curveMonotoneY',
  'curveNatural',
  'curveStep',
  'curveStepAfter',
  'curveStepBefore',
  'curveBasisClosed',
];

const scaleOptions = ['linear', 'log'];

const shortEnglishHumanizer = humanizeDuration.humanizer({
  language: 'shortEn',
  languages: {
    shortEn: {
      y: () => 'y',
      mo: () => 'mo',
      w: () => 'w',
      d: () => 'd',
      h: () => 'h',
      m: () => 'm',
      s: () => 's',
      ms: () => 'ms',
    },
  },
  units: ['d', 'h', 'm', 's'],
  spacer: '',
  delimiter: ' ',
  largest: 1,
});

function PanelChart(props) {
  let visBox = useRef({
    margin: {
      top: 24,
      right: 20,
      bottom: 30,
      left: 60,
    },
    height: null,
    width: null,
  });
  let plotBox = useRef({
    height: null,
    width: null,
  });
  let chartOptions = useRef({
    xNum: 0,
    xMax: 0,
    xSteps: [],
    xScale: null,
    yScale: null,
  });

  let {
    setChartFocusedState,
    setChartFocusedActiveState,
    setChartSettingsState,
  } = HubMainScreenModel.emitters;

  let {
    contextToHash,
    traceToHash,
    getTraceData,
    getMetricColor,
    isAimRun,
    isTFSummaryScalar,
    getClosestStepData,
  } = HubMainScreenModel.helpers;

  const parentRef = useRef();
  const visRef = useRef();
  const svg = useRef(null);
  const plot = useRef(null);
  const bgRect = useRef(null);
  const hoverLine = useRef(null);
  const axes = useRef(null);
  const lines = useRef(null);
  const circles = useRef(null);
  const attributes = useRef(null);
  const brush = useRef(null);
  const idleTimeout = useRef(null);

  function initD3() {
    d3.selection.prototype.moveToFront = function () {
      return this.each(function () {
        this.parentNode.appendChild(this);
      });
    };
  }

  function renderChart() {
    clear();
    draw();
  }

  function clear() {
    if (!visRef.current) {
      return;
    }

    const visArea = d3.select(visRef.current);
    visArea.selectAll('*').remove();
    visArea.attr('style', null);
  }

  function draw() {
    if (!visRef.current) {
      return;
    }

    drawArea();
    drawAxes();
    drawData();
    bindInteractions();
  }

  function drawData() {
    const { contextFilter } = HubMainScreenModel.getState();
    if (contextFilter.aggregated) {
      drawAggregatedLines();
    } else {
      drawLines();
    }
    drawHoverAttributes();
  }

  function drawArea() {
    const { traceList, chart } = HubMainScreenModel.getState();
    const parent = d3.select(parentRef.current);
    const visArea = d3.select(visRef.current);
    const parentRect = parent.node().getBoundingClientRect();
    const parentWidth = parentRect.width;
    const parentHeight = parentRect.height;

    const { margin } = visBox.current;
    const width = parentWidth;
    const height = parentHeight;

    visBox.current = {
      ...visBox.current,
      width,
      height,
    };
    plotBox.current = {
      ...plotBox.current,
      width: width - margin.left - margin.right,
      height: height - margin.top - margin.bottom,
    };

    visArea.style('width', `${width}px`).style('height', `${height}px`);

    svg.current = visArea
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('xmlns', 'http://www.w3.org/2000/svg'); // .attr('id', 'panel_svg');

    if (traceList?.grouping.chart) {
      const titleMarginTop = 5;
      const titleMarginBottom = 2;
      const titleHeight = margin.top - titleMarginTop - titleMarginBottom;
      svg.current
        .append('foreignObject')
        .attr('x', 0)
        .attr('y', titleMarginTop)
        .attr('height', titleHeight)
        .attr('width', width)
        .html((d) => {
          const title =
            traceList?.grouping.chart.length > 0
              ? `${traceList?.grouping.chart
                .map((key) => {
                  return (
                    key +
                      '=' +
                      formatValue(
                        traceList.traces.find(
                          (elem) => elem.chart === props.index,
                        )?.config[key],
                        false,
                      )
                  );
                })
                .join(', ')}`
              : '';
          const index = props.index + 1;

          if (!traceList?.grouping.chart.length) {
            return '';
          }

          return `
            <div class='ChartTitle' title='#${index} ${title}'>
              <div style='width: ${titleHeight}px; height: ${titleHeight}px;' class='ChartTitle__index'>${index}</div>
              <div class='ChartTitle__text'>${title}</div>
            </div>`;
        })
        .moveToFront();
    }

    bgRect.current = svg.current
      .append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', width - margin.left - margin.right)
      .attr('height', height - margin.top - margin.bottom)
      .style('fill', 'transparent');

    plot.current = svg.current
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    axes.current = plot.current.append('g').attr('class', 'Axes');

    lines.current = plot.current.append('g').attr('class', 'Lines');
    lines.current
      .append('clipPath')
      .attr('id', 'lines-rect-clip-' + props.index)
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width - margin.left - margin.right)
      .attr('height', height - margin.top - margin.bottom);

    attributes.current = plot.current.append('g');
    attributes.current
      .append('clipPath')
      .attr('id', 'circles-rect-clip-' + props.index)
      .append('rect')
      .attr('x', -7)
      .attr('y', 0)
      .attr('width', width - margin.left - margin.right + 14)
      .attr('height', height - margin.top - margin.bottom);

    if (chart.settings.zoomMode) {
      brush.current = d3
        .brush()
        .extent([
          [margin.left, margin.top],
          [width - margin.right, height - margin.bottom],
        ])
        .on('end', handleZoomChange);

      svg.current.append('g').attr('class', 'brush').call(brush.current);
    }
  }

  function drawAxes() {
    const { traceList, chart } = HubMainScreenModel.getState();
    const { width, height, margin } = visBox.current;
    const xAlignment = chart.settings.persistent.xAlignment;

    let xNum = 0;
    let xMax = 0;
    let xMin = Infinity;
    let xSteps = [];
    let xTicks = [];

    if (xAlignment === 'epoch' && traceList.epochSteps[props.index]) {
      xTicks = Object.keys(traceList.epochSteps[props.index]).map((epoch) => {
        return [
          traceList.epochSteps[props.index][epoch][0],
          epoch === 'null' ? null : epoch,
        ];
      });
    }

    traceList?.traces.forEach((traceModel) => {
      traceModel.series.forEach((series) => {
        if (traceModel.chart !== props.index) {
          return;
        }
        const { run, metric, trace } = series;
        const max = trace.axisValues[trace.axisValues.length - 1];
        const min = trace.axisValues[0];
        if (max > xMax) {
          xMax = max;
        }
        if (min < xMin) {
          if (scaleOptions[chart.settings.persistent.xScale] === 'log') {
            xMin = min === 0 ? 1 : min;
          } else {
            xMin = min;
          }
        }

        xSteps = _.uniq(xSteps.concat(trace.axisValues).sort((a, b) => a - b));
        xNum = xSteps.length;
      });
    });

    let xScaleBase;
    if (scaleOptions[chart.settings.persistent.xScale || 0] === 'linear') {
      xScaleBase = d3.scaleLinear();
    } else if (scaleOptions[chart.settings.persistent.xScale] === 'log') {
      xScaleBase = d3.scaleLog();
    }

    const xScale = xScaleBase
      .domain(chart.settings.persistent.zoom?.[props.index]?.x ?? [xMin, xMax])
      .range([0, width - margin.left - margin.right]);

    let yMax = null,
      yMin = null;

    if (chart.settings.persistent.displayOutliers) {
      traceList?.traces.forEach((traceModel) =>
        traceModel.series.forEach((series) => {
          if (traceModel.chart !== props.index) {
            return;
          }
          const { run, metric, trace } = series;
          const traceMax =
            trace && trace.data
              ? Math.max(...trace.data.map((elem) => elem[0]))
              : null;
          const traceMin =
            trace && trace.data
              ? Math.min(...trace.data.map((elem) => elem[0]))
              : null;
          if (yMax == null || traceMax > yMax) {
            yMax = traceMax;
          }
          if (yMin == null || traceMin < yMin) {
            yMin = traceMin === 0 ? 1 : traceMin;
          }
        }),
      );
    } else {
      let minData = [],
        maxData = [];
      traceList?.traces.forEach((traceModel) =>
        traceModel.series.forEach((series) => {
          if (traceModel.chart !== props.index) {
            return;
          }
          const { run, metric, trace } = series;
          if (trace?.data) {
            trace.data.forEach((elem, elemIdx) => {
              if (minData.length > elemIdx) {
                minData[elemIdx].push(elem[0]);
              } else {
                minData.push([elem[0]]);
              }
              if (maxData.length > elemIdx) {
                maxData[elemIdx].push(elem[0]);
              } else {
                maxData.push([elem[0]]);
              }
            });
          }
        }),
      );

      minData = minData.map((e) => Math.min(...e));
      minData = removeOutliers(minData, 4);

      maxData = maxData.map((e) => Math.max(...e));
      maxData = removeOutliers(maxData, 4);

      yMin = minData[0] === 0 ? 1 : minData[0];
      yMax = maxData[maxData.length - 1];
    }

    let yScaleBase;
    if (scaleOptions[chart.settings.persistent.yScale || 0] === 'linear') {
      if (yMax === yMin) {
        yMax += 1;
        yMin -= 1;
      } else {
        const diff = yMax - yMin;
        yMax += diff * 0.1;
        yMin -= diff * 0.05;
      }
      yScaleBase = d3.scaleLinear();
    } else if (scaleOptions[chart.settings.persistent.yScale] === 'log') {
      yScaleBase = d3.scaleLog();
    }

    const yScale = yScaleBase
      .domain(chart.settings.persistent.zoom?.[props.index]?.y ?? [yMin, yMax])
      .range([height - margin.top - margin.bottom, 0]);

    let xAxisTicks = d3.axisBottom(xScale);

    if (xAlignment === 'epoch') {
      const ticksCount = Math.floor(plotBox.current.width / 50);
      const delta = Math.floor(xTicks.length / ticksCount);
      const ticks =
        delta > 1 ? xTicks.filter((_, i) => i % delta === 0) : xTicks;
      xAxisTicks
        .tickValues(ticks.map((tick) => tick[0]))
        .tickFormat((d, i) => ticks[i][1]);
    } else if (xAlignment === 'relative_time') {
      let ticksCount = Math.floor(plotBox.current.width / 85);
      ticksCount = ticksCount > 1 ? ticksCount - 1 : 1;
      const minute = 60;
      const hour = 60 * minute;
      const day = 24 * hour;
      const week = 7 * day;
      const [first, last] = xScale.domain();
      const diff = Math.ceil(last - first);
      let unit;
      let formatUnit;
      if (diff / week > 4) {
        unit = week;
        formatUnit = 'w';
      } else if (diff / day > 3) {
        unit = day;
        formatUnit = 'd';
      } else if (diff / hour > 3) {
        unit = hour;
        formatUnit = 'h';
      } else if (diff / minute > 4) {
        unit = minute;
        formatUnit = 'm';
      } else {
        unit = null;
        formatUnit = 's';
      }
      let tickValues =
        unit === null
          ? null
          : _.range(Math.ceil(first), Math.ceil(last) + 1).filter(
            (t) => t % unit === 0,
          );
      if (unit !== null && ticksCount < tickValues.length) {
        tickValues = tickValues.filter((v, i) => {
          if (i === 0 || i === tickValues.length - 1) {
            return true;
          }
          const interval = Math.floor(
            (tickValues.length - 2) / (ticksCount - 2),
          );
          return i % interval === 0 && tickValues.length - interval > i;
        });
      }

      xAxisTicks
        .ticks(ticksCount)
        .tickValues(tickValues)
        .tickFormat((d, i) =>
          shortEnglishHumanizer(+d * 1000, { units: [formatUnit] }),
        );
    } else if (xAlignment === 'absolute_time') {
      const ticksCount = Math.floor(plotBox.current.width / 120);
      xAxisTicks
        .ticks(ticksCount > 1 ? ticksCount - 1 : 1)
        .tickFormat((d, i) => moment.unix(d).format('HH:mm:ss D MMM, YY'));
    }

    const xAxis = axes.current
      .append('g')
      .attr('class', 'x axis')
      .attr('transform', `translate(0, ${plotBox.current.height})`)
      .call(xAxisTicks);

    const initialTicks = axes.current.selectAll('.tick');
    const ticksPositions = [];
    initialTicks.each((data) => {
      ticksPositions.push(xScale(data));
    });

    for (let i = ticksPositions.length - 1; i > 0; i--) {
      let currentTickPos = ticksPositions[i];
      let prevTickPos = ticksPositions[i - 1];
      if (currentTickPos - prevTickPos < 10) {
        xAxis.select(`.tick:nth-of-type(${i})`).attr('hidden', true);
      }
    }

    if (scaleOptions[chart.settings.persistent.xScale] === 'log') {
      xAxis
        .selectAll('text')
        .style('text-anchor', 'middle')
        .attr('dx', '-.8em')
        .attr('dy', '.15em')
        .attr('transform', 'rotate(-40)');
    }

    svg.current
      .append('text')
      .attr(
        'transform',
        `translate(
        ${visBox.current.width - 20},
        ${visBox.current.height - visBox.current.margin.bottom - 5}
      )`,
      )
      .attr('text-anchor', 'end')
      .attr('alignment-baseline', 'ideographic')
      .style('font-size', '0.7em')
      .style('text-transform', 'capitalize')
      .style('fill', 'var(--grey)')
      .text(
        xAlignment
          ? `${xAlignment.replace('_', ' ')}${
              xAlignment === 'step' || xAlignment === 'epoch' ? 's' : ''
            }`
          : 'steps',
      );

    const yAxisTicks = d3.axisLeft(yScale);
    const ticksCount = Math.floor(plotBox.current.height / 20);
    yAxisTicks.ticks(ticksCount > 3 ? (ticksCount < 20 ? ticksCount : 20) : 3);

    axes.current.append('g').attr('class', 'y axis').call(yAxisTicks);

    chartOptions.current = {
      ...chartOptions.current,
      xNum,
      xMax,
      xSteps,
      xScale,
      yScale,
    };
  }

  function drawLines() {
    const { traceList, chart, contextFilter } = HubMainScreenModel.getState();
    const highlightMode = chart.settings.highlightMode;

    const focusedMetric = chart.focused.metric;
    const focusedCircle = chart.focused.circle;
    const focusedLineAttr =
      focusedCircle.runHash !== null ? focusedCircle : focusedMetric;

    const noSelectedRun =
      highlightMode === 'default' || !focusedLineAttr.runHash;

    let runIndex = 0;

    traceList?.traces.forEach((traceModel) =>
      traceModel.series.forEach((series) => {
        if (traceModel.chart !== props.index) {
          runIndex++;
          return;
        }
        const { run, metric, trace } = series;

        if (run.metricIsHidden) {
          runIndex++;
          return;
        }

        const traceData = [];
        const axisValues = trace.axisValues.filter((xVal, i) => {
          const isXLogScale =
            scaleOptions[chart.settings.persistent.xScale] === 'log';
          const isYLogScale =
            scaleOptions[chart.settings.persistent.yScale] === 'log';
          if (
            (isXLogScale && xVal <= 0) ||
            (isYLogScale && trace?.data[i]?.[0] <= 0)
          ) {
            return false;
          }
          if (!!trace?.data) {
            traceData.push(trace?.data[i]);
          }
          return true;
        });
        const line = d3
          .line()
          .x((d, i) => chartOptions.current.xScale(axisValues[i]))
          .y((d) => chartOptions.current.yScale(d[0]))
          .curve(
            d3[
              curveOptions[
                chart.settings.persistent.interpolate &&
                !contextFilter.aggregated
                  ? 5
                  : 0
              ]
            ],
          );

        const traceContext = contextToHash(trace?.context);

        const active =
          highlightMode === 'run' && focusedLineAttr.runHash === run.run_hash;
        const current =
          focusedLineAttr.runHash === run.run_hash &&
          focusedLineAttr.metricName === metric?.name &&
          focusedLineAttr.traceContext === traceContext;

        lines.current
          .append('path')
          .attr(
            'class',
            `PlotLine PlotLine-${run.run_hash} PlotLine-${traceToHash(
              run.run_hash,
              metric?.name,
              traceContext,
            )} ${noSelectedRun ? '' : 'inactive'} ${active ? 'active' : ''} ${
              current ? 'current' : ''
            }`,
          )
          .datum(traceData)
          .attr('d', line)
          .attr('clip-path', 'url(#lines-rect-clip-' + props.index + ')')
          .style('fill', 'none')
          .style(
            'stroke',
            traceList?.grouping?.color?.length > 0
              ? traceModel.color
              : getMetricColor(run, metric, trace, runIndex),
          )
          .style(
            'stroke-dasharray',
            traceList?.grouping?.stroke?.length > 0 ? traceModel.stroke : '0',
          )
          .attr('data-run-hash', run.run_hash)
          .attr('data-metric-name', metric?.name)
          .attr('data-trace-context-hash', traceContext)
          .on('click', function () {
            handleLineClick(d3.mouse(this));
          });

        runIndex++;
      }),
    );
  }

  function drawAggregatedLines() {
    const { traceList, chart, contextFilter } = HubMainScreenModel.getState();
    const focusedMetric = chart.focused.metric;
    const focusedCircle = chart.focused.circle;
    const highlightMode = chart.settings.highlightMode;
    const focusedLineAttr =
      focusedCircle?.runHash !== null
        ? focusedCircle
        : focusedMetric.runHash !== null
          ? focusedMetric
          : null;
    traceList?.traces.forEach((traceModel) => {
      if (traceModel.chart !== props.index) {
        return;
      }

      const {
        run: runAvg,
        metric: metricAvg,
        trace: traceAvg,
      } = traceModel.aggregation.avg;
      const {
        run: runMed,
        metric: metricMed,
        trace: traceMed,
      } = traceModel.aggregation.med;
      const {
        run: runMin,
        metric: metricMin,
        trace: traceMin,
      } = traceModel.aggregation.min;
      const {
        run: runMax,
        metric: metricMax,
        trace: traceMax,
      } = traceModel.aggregation.max;

      const noSelectedRun =
        highlightMode === 'default' || !focusedLineAttr?.runHash;

      const active =
        highlightMode === 'run'
          ? traceModel.hasRunWithRunHash(focusedLineAttr?.runHash)
          : traceModel.hasRun(
              focusedLineAttr?.runHash,
              focusedLineAttr?.metricName,
              focusedLineAttr?.traceContext,
          );

      if (contextFilter.aggregatedArea !== 'none') {
        const traceMaxData = traceMax.data.filter(
          (point) => !Number.isNaN(chartOptions.current.xScale(point[1])),
        );
        const traceMinData = traceMin.data.filter(
          (point) => !Number.isNaN(chartOptions.current.xScale(point[1])),
        );
        const area = d3
          .area()
          .x((d, i) => chartOptions.current.xScale(d[1]))
          .y0((d, i) => chartOptions.current.yScale(d[0]))
          .y1((d, i) => chartOptions.current.yScale(traceMinData[i][0]))
          .curve(d3[curveOptions[0]]);

        lines.current
          .append('path')
          .attr(
            'class',
            `PlotArea ${noSelectedRun ? '' : 'inactive'} ${
              active ? 'active' : ''
            }`,
          )
          .datum(traceMaxData)
          .attr('d', area)
          .attr('clip-path', 'url(#lines-rect-clip-' + props.index + ')')
          .attr(
            'fill',
            Color(
              traceList?.grouping?.color?.length > 0
                ? traceModel.color
                : getMetricColor(runAvg, metricAvg, traceAvg),
            )
              .alpha(0.3)
              .hsl()
              .string(),
          )
          .on('click', function () {
            handleLineClick(d3.mouse(this));
          });
      }

      const aggLineFunc = d3
        .line()
        .x((d) => chartOptions.current.xScale(d[1]))
        .y((d) => chartOptions.current.yScale(d[0]))
        .curve(d3[curveOptions[0]]);

      let aggLine = {};
      switch (contextFilter.aggregatedLine) {
        case 'avg':
          aggLine.run = runAvg;
          aggLine.metric = metricAvg;
          aggLine.trace = traceAvg;
          break;
        case 'median':
          aggLine.run = runMed;
          aggLine.metric = metricMed;
          aggLine.trace = traceMed;
          break;
        case 'min':
          aggLine.run = runMin;
          aggLine.metric = metricMin;
          aggLine.trace = traceMin;
          break;
        case 'max':
          aggLine.run = runMax;
          aggLine.metric = metricMax;
          aggLine.trace = traceMax;
          break;
      }

      lines.current
        .append('path')
        .attr(
          'class',
          `PlotLine PlotLine-${traceToHash(
            aggLine.run.run_hash,
            aggLine.metric.name,
            aggLine.trace.context,
          )} active`,
        )
        .datum(
          aggLine.trace.data.filter(
            (point) => !Number.isNaN(chartOptions.current.xScale(point[1])),
          ),
        )
        .attr('d', aggLineFunc)
        .attr('clip-path', 'url(#lines-rect-clip-' + props.index + ')')
        .style('fill', 'none')
        .style(
          'stroke',
          traceList?.grouping?.color?.length > 0
            ? traceModel.color
            : getMetricColor(aggLine.run, aggLine.metric, aggLine.trace),
        )
        .style(
          'stroke-dasharray',
          traceList?.grouping?.stroke?.length > 0 ? traceModel.stroke : '0',
        )
        .attr('data-run-hash', aggLine.run.run_hash)
        .attr('data-metric-name', aggLine.metric.name)
        .attr('data-trace-context-hash', contextToHash(aggLine.trace.context))
        .on('click', function () {
          handleLineClick(d3.mouse(this));
        });

      if (!noSelectedRun) {
        let runIndex = 0;
        traceList?.traces.forEach((traceModel) => {
          traceModel.series.forEach((series) => {
            if (traceModel.chart !== props.index) {
              runIndex++;
              return;
            }
            const { run, metric, trace } = series;

            if (run.metricIsHidden) {
              runIndex++;
              return;
            }

            const traceContext = contextToHash(trace?.context);
            let activeRun =
              highlightMode === 'run'
                ? focusedLineAttr.runHash === run.run_hash
                : false;
            const current =
              focusedLineAttr.runHash === run.run_hash &&
              focusedLineAttr.metricName === metric?.name &&
              focusedLineAttr.traceContext === traceContext;
            if (!current && !activeRun) {
              runIndex++;
              return;
            }
            const traceData = [];
            const axisValues = trace.axisValues.filter((xVal, i) => {
              const isXLogScale =
                scaleOptions[chart.settings.persistent.xScale] === 'log';
              const isYLogScale =
                scaleOptions[chart.settings.persistent.yScale] === 'log';
              if (
                (isXLogScale && xVal <= 0) ||
                (isYLogScale && trace?.data[i]?.[0] <= 0)
              ) {
                return false;
              }
              if (!!trace?.data) {
                traceData.push(trace.data[i]);
              }
              return true;
            });
            const focusedLine = d3
              .line()
              .x((d, i) => chartOptions.current.xScale(axisValues[i]))
              .y((d) => chartOptions.current.yScale(d[0]))
              .curve(
                d3[
                  curveOptions[
                    chart.settings.persistent.interpolate &&
                    !contextFilter.aggregated
                      ? 5
                      : 0
                  ]
                ],
              );

            lines.current
              .append('path')
              .attr(
                'class',
                `PlotLine PlotLine-${
                  focusedLineAttr?.runHash
                } PlotLine-${traceToHash(
                  focusedLineAttr?.runHash,
                  focusedLineAttr?.metricName,
                  focusedLineAttr?.traceContext,
                )} ${activeRun ? 'active' : ''} ${current ? 'current' : ''}`,
              )
              .datum(traceData)
              .attr('d', focusedLine)
              .attr('clip-path', 'url(#lines-rect-clip-' + props.index + ')')
              .style('fill', 'none')
              .style(
                'stroke',
                traceList?.grouping?.color?.length > 0
                  ? traceModel.color
                  : getMetricColor(run, metric, trace, runIndex),
              )
              .style(
                'stroke-dasharray',
                traceList?.grouping?.stroke?.length > 0
                  ? traceModel.stroke
                  : '0',
              )
              .attr('data-run-hash', run.run_hash)
              .attr('data-metric-name', metric?.name)
              .attr('data-trace-context-hash', traceContext)
              .on('click', function () {
                handleLineClick(d3.mouse(this));
              });
            runIndex++;
          });
        });
      }
    });
  }

  function drawHoverAttributes() {
    const { chart, traceList, contextFilter } = HubMainScreenModel.getState();
    const highlightMode = chart.settings.highlightMode;
    const focused = chart.focused;
    let step = focused.circle.active ? focused.circle.step : focused.step;
    if (step === null || step === undefined) {
      return;
    }

    let x = chartOptions.current.xScale(step);

    const { height } = plotBox.current;
    const isXLogScale =
      scaleOptions[chart.settings.persistent.xScale] === 'log';
    const isYLogScale =
      scaleOptions[chart.settings.persistent.yScale] === 'log';

    if (!isXLogScale || step > 0) {
      // Draw hover line
      hoverLine.current = attributes.current
        .append('line')
        .attr('x1', x)
        .attr('y1', 0)
        .attr('x2', x)
        .attr('y2', height)
        .attr('class', 'HoverLine')
        .style('stroke-width', 1)
        .style('stroke-dasharray', '4 2')
        .style('fill', 'none');
    }

    // Draw circles
    const focusedMetric = focused.metric;
    const focusedCircle = focused.circle;
    const focusedLineAttr =
      focusedCircle.runHash !== null ? focusedCircle : focusedMetric;
    let focusedCircleElem = null;

    circles.current = attributes.current.append('g');

    let runIndex = 0;

    traceList?.traces.forEach((traceModel) =>
      traceModel.series.forEach((series) => {
        if (traceModel.chart !== props.index) {
          runIndex++;
          return;
        }
        const { run, metric, trace } = series;

        if (run.metricIsHidden) {
          runIndex++;
          return;
        }

        let { closestStep, stepData } = getClosestStepData(
          step,
          trace?.data,
          trace?.axisValues,
        );

        let val = stepData?.[0] ?? null;

        if ((isXLogScale && closestStep <= 0) || (isYLogScale && val <= 0)) {
          runIndex++;
          return;
        }

        if (val !== null) {
          x = chartOptions.current.xScale(closestStep);
          const y = chartOptions.current.yScale(val);
          const traceContext = contextToHash(trace?.context);

          let shouldHighlightCircle;
          if (highlightMode === 'default' || !focusedLineAttr.runHash) {
            shouldHighlightCircle = true;
          } else if (highlightMode === 'run') {
            shouldHighlightCircle = focusedLineAttr.runHash === run.run_hash;
          } else if (highlightMode === 'metric') {
            shouldHighlightCircle =
              focusedLineAttr.runHash === run.run_hash &&
              focusedLineAttr.metricName === metric?.name &&
              focusedLineAttr.traceContext === traceContext;
          } else {
            shouldHighlightCircle = false;
          }

          const circle = circles.current
            .append('circle')
            .attr(
              'class',
              `HoverCircle HoverCircle-${closestStep} ${
                shouldHighlightCircle ? '' : 'inactive'
              } HoverCircle-${traceToHash(
                run.run_hash,
                metric?.name,
                traceContext,
              )}`,
            )
            .attr('cx', x)
            .attr('cy', y)
            .attr('r', circleRadius)
            .attr('data-x', x)
            .attr('data-y', y)
            .attr('data-step', closestStep)
            .attr('data-run-hash', run.run_hash)
            .attr('data-metric-name', metric?.name)
            .attr('data-trace-context-hash', contextToHash(trace?.context))
            .attr('clip-path', 'url(#circles-rect-clip-' + props.index + ')')
            .style(
              'fill',
              traceList?.grouping?.color?.length > 0
                ? traceModel.color
                : getMetricColor(run, metric, trace, runIndex),
            )
            .on('click', function () {
              handlePointClick(
                closestStep,
                run.run_hash,
                metric?.name,
                traceContext,
              );
            });

          runIndex++;

          if (
            focusedCircle.active === true &&
            focusedCircle.runHash === run.run_hash &&
            focusedCircle.metricName === metric.name &&
            focusedCircle.traceContext === traceContext &&
            focusedCircle.step === step
          ) {
            focusedCircleElem = circle;
          }
        }
      }),
    );

    // Apply focused state to line and circle
    if (focusedMetric.runHash !== null) {
      plot.current.selectAll('.PlotArea.active').moveToFront();
      plot.current.selectAll('.PlotLine.current').moveToFront();

      circles.current.selectAll('*.focus').moveToFront();
      circles.current
        .selectAll(
          `.HoverCircle-${traceToHash(
            focusedMetric.runHash,
            focusedMetric.metricName,
            focusedMetric.traceContext,
          )}`,
        )
        .classed('active', true)
        .attr('r', circleActiveRadius)
        .moveToFront();
    }

    // Add focused circle and/or apply focused state
    if (
      focusedCircle.active === true &&
      (contextFilter.groupByChart.length === 0 ||
        traceList?.traces
          .filter((trace) => trace.chart === props.index)
          .some((traceModel) =>
            traceModel.hasRun(
              focusedCircle.runHash,
              focusedCircle.metricName,
              focusedCircle.traceContext,
            ),
          ))
    ) {
      if (focusedCircleElem !== null) {
        focusedCircleElem
          .classed('focus', true)
          .classed('active', false)
          .attr('r', circleActiveRadius)
          .moveToFront();
      } else {
        const focusedCircleX = chartOptions.current.xScale(focusedCircle.step);
        const line = getTraceData(
          focusedCircle.runHash,
          focusedCircle.metricName,
          focusedCircle.traceContext,
        );
        if (line !== null) {
          const focusedCircleVal =
            line?.data?.[line?.axisValues?.indexOf(focusedCircle.step)]?.[0] ??
            null;
          if (focusedCircleVal !== null) {
            const focusedCircleY = chartOptions.current.yScale(
              focusedCircleVal,
            );

            circles.current
              .append('circle')
              .attr(
                'class',
                `HoverCircle HoverCircle-${focusedCircle.metricIndex} focus`,
              )
              .attr('cx', focusedCircleX)
              .attr('cy', focusedCircleY)
              .attr('r', circleActiveRadius)
              .attr('data-x', focusedCircleX)
              .attr('data-y', focusedCircleY)
              .attr('data-step', focusedCircle.step)
              .attr('data-run-hash', focusedCircle.runHash)
              .attr('data-metric-name', focusedCircle.metricName)
              .attr('data-trace-context-hash', focusedCircle.traceContext)
              .attr('clip-path', 'url(#lines-rect-clip-' + props.index + ')')
              .style('fill', getMetricColor(line.run, line.metric, line.trace))
              .on('click', function () {
                handlePointClick(
                  focusedCircle.step,
                  focusedCircle.runHash,
                  focusedCircle.metricName,
                  focusedCircle.traceContext,
                );
              })
              .moveToFront();
          }
        }
      }
    }
  }

  function bindInteractions() {
    svg.current.on('mousemove', function () {
      handleAreaMouseMove(d3.mouse(this));
    });

    svg.current.on('mouseleave', function () {
      handleVisAreaMouseOut(d3.mouse(this));
    });

    bgRect.current.on('click', function () {
      handleBgRectClick(d3.mouse(this));
    });
  }

  function idled() {
    idleTimeout.current = null;
  }

  function handleZoomChange() {
    const { chart } = HubMainScreenModel.getState();
    let extent = d3.event.selection;

    // If no selection, back to initial coordinate. Otherwise, update X axis domain
    if (!extent) {
      if (!idleTimeout.current) {
        return (idleTimeout.current = setTimeout(idled, 350)); // This allows to wait a little bit
      }
      setChartSettingsState({
        ...chart.settings,
        persistent: {
          ...chart.settings.persistent,
          zoom: null,
        },
      });
    } else {
      const { margin } = visBox.current;

      let left = chartOptions.current.xScale.invert(extent[0][0] - margin.left);
      let right = chartOptions.current.xScale.invert(
        extent[1][0] - margin.left,
      );

      let top = chartOptions.current.yScale.invert(extent[0][1] - margin.top);
      let bottom = chartOptions.current.yScale.invert(
        extent[1][1] - margin.top,
      );

      let [xMin, xMax] = chartOptions.current.xScale.domain();
      let [yMin, yMax] = chartOptions.current.yScale.domain();

      setChartSettingsState({
        ...chart.settings,
        zoomMode: false,
        zoomHistory: [
          [props.index, chart.settings.persistent.zoom?.[props.index] ?? null],
        ].concat(chart.settings.zoomHistory),
        persistent: {
          ...chart.settings.persistent,
          zoom: {
            ...(chart.settings.persistent.zoom ?? {}),
            [props.index]: {
              x:
                extent[1][0] - extent[0][0] < 5
                  ? null
                  : [left < xMin ? xMin : left, right > xMax ? xMax : right],
              y:
                extent[1][1] - extent[0][1] < 5
                  ? null
                  : [bottom < yMin ? yMin : bottom, top > yMax ? yMax : top],
            },
          },
        },
      });
      // This remove the grey brush area as soon as the selection has been done
      svg.current.select('.brush').call(brush.current.move, null);
    }
  }

  function handleAreaMouseMove(mouse) {
    const { chart } = HubMainScreenModel.getState();
    // Disable hover effects if circle is focused
    if (chart.focused.circle.active) {
      return false;
    }

    // Update active state
    setActiveLineAndCircle(mouse);

    // Remove hovered line state
    unsetHoveredLine(mouse);
  }

  function handleVisAreaMouseOut(mouse) {
    const { circle } = HubMainScreenModel.getState().chart.focused;
    if (!circle.active) {
      unsetHoveredLine(mouse);
    }
  }

  function handleBgRectClick(mouse) {
    const { chart } = HubMainScreenModel.getState();
    if (!chart.focused.circle.active) {
      return;
    }

    setChartFocusedState({
      circle: {
        runHash: null,
        metricName: null,
        traceContext: null,
      },
      step: null,
    });

    // Update active state
    setActiveLineAndCircle(mouse);
  }

  function handleLineClick(mouse) {
    const { chart } = HubMainScreenModel.getState();
    if (!chart.focused.circle.active) {
      return;
    }

    setChartFocusedState({
      circle: {
        active: false,
        runHash: null,
        metricName: null,
        traceContext: null,
        step: null,
      },
      step: null,
    });

    // Update active state
    setActiveLineAndCircle(mouse, false);
  }

  function handlePointClick(step, runHash, metricName, traceContext) {
    setChartFocusedActiveState({
      circle: {
        active: true,
        step,
        runHash,
        metricName,
        traceContext,
      },
      metric: {
        runHash: null,
        metricName: null,
        traceContext: null,
      },
    });

    setTimeout(() => {
      let activeRow = document.querySelector('.ContextBox__table__cell.active');
      if (activeRow) {
        activeRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    });
  }

  function setActiveLineAndCircle(mouse, marginInc = true) {
    const { chart } = HubMainScreenModel.getState();
    const { margin } = visBox.current;

    if (isMouseInVisArea(mouse)) {
      const data = chartOptions.current.xSteps;
      const x = marginInc ? mouse[0] - margin.left : mouse[0];
      const y = marginInc ? mouse[1] - margin.top : mouse[1];
      let step = 0;

      if (x >= 0) {
        // Line
        const xPoint = chartOptions.current.xScale.invert(x);
        const relIndex = d3.bisect(data, xPoint, 1);
        const a = data[relIndex - 1];
        const b = data[relIndex];

        step = xPoint - a > b - xPoint ? b : a;

        if (step !== chart.focused.step) {
          setChartFocusedState({
            step,
          });
        }

        // Find the nearest circle
        if (circles.current) {
          // Circles
          let nearestCircle = [];

          circles.current
            .selectAll(`.HoverCircle[data-step='${step}']`)
            .each(function () {
              const elem = d3.select(this);
              const elemY = parseFloat(elem.attr('data-y'));
              const r = Math.abs(elemY - y);

              if (nearestCircle.length === 0 || r < nearestCircle[0].r) {
                nearestCircle = [
                  {
                    r: r,
                    nearestCircleRunHash: elem.attr('data-run-hash'),
                    nearestCircleMetricName: elem.attr('data-metric-name'),
                    nearestCircleTraceContext: elem.attr(
                      'data-trace-context-hash',
                    ),
                  },
                ];
              } else if (nearestCircle.length && r === nearestCircle[0].r) {
                nearestCircle.push({
                  r: r,
                  nearestCircleRunHash: elem.attr('data-run-hash'),
                  nearestCircleMetricName: elem.attr('data-metric-name'),
                  nearestCircleTraceContext: elem.attr(
                    'data-trace-context-hash',
                  ),
                });
              }
            });

          nearestCircle.sort((a, b) => {
            const aHash = traceToHash(
              a.nearestCircleRunHash,
              a.nearestCircleMetricName,
              a.nearestCircleTraceContext,
            );
            const bHash = traceToHash(
              b.nearestCircleRunHash,
              b.nearestCircleMetricName,
              b.nearestCircleTraceContext,
            );
            return aHash > bHash ? 1 : -1;
          });

          if (nearestCircle.length) {
            const nearestCircleRunHash = nearestCircle[0].nearestCircleRunHash;
            const nearestCircleMetricName =
              nearestCircle[0].nearestCircleMetricName;
            const nearestCircleTraceContext =
              nearestCircle[0].nearestCircleTraceContext;

            if (
              nearestCircleRunHash !== chart.focused.metric.runHash ||
              nearestCircleMetricName !== chart.focused.metric.metricName ||
              nearestCircleTraceContext !== chart.focused.metric.traceContext
            ) {
              setChartFocusedState({
                metric: {
                  runHash: nearestCircleRunHash,
                  metricName: nearestCircleMetricName,
                  traceContext: nearestCircleTraceContext,
                },
              });
            }
          }
        }
      }
    }
  }

  function unsetHoveredLine(mouse = false) {
    if (mouse === false || !isMouseInVisArea(mouse)) {
      setChartFocusedState({
        metric: {
          runHash: null,
          metricName: null,
          traceContext: null,
        },
      });
    }
  }

  function isMouseInVisArea(mouse) {
    const { width, height, margin } = visBox.current;
    const padding = 5;

    return (
      mouse[0] > margin.left - padding &&
      mouse[0] < width - margin.right + padding &&
      mouse[1] > margin.top - padding &&
      mouse[1] < height - margin.bottom + padding
    );
  }

  useEffect(() => {
    initD3();
    const animatedRender = () => window.requestAnimationFrame(renderChart);
    window.addEventListener('resize', animatedRender);
    const rerenderSubscription = HubMainScreenModel.subscribe(
      [
        HubMainScreenModel.events.SET_TRACE_LIST,
        HubMainScreenModel.events.SET_CHART_SETTINGS_STATE,
        HubMainScreenModel.events.SET_CHART_FOCUSED_ACTIVE_STATE,
        HubMainScreenModel.events.SET_CHART_HIDDEN_METRICS,
      ],
      animatedRender,
    );
    const updateSubscription = HubMainScreenModel.subscribe(
      HubMainScreenModel.events.SET_CHART_FOCUSED_STATE,
      () => {
        window.requestAnimationFrame(() => {
          lines.current?.selectAll('path').remove();
          attributes.current?.selectAll('g').remove();
          attributes.current?.selectAll('line').remove();
          drawData();
        });
      },
    );

    return () => {
      rerenderSubscription.unsubscribe();
      updateSubscription.unsubscribe();
      window.removeEventListener('resize', animatedRender);
    };
  }, []);

  useEffect(() => {
    window.requestAnimationFrame(renderChart);
    return () => {
      window.cancelAnimationFrame(renderChart);
    };
  }, [props.width, props.height]);

  const styles = {};

  if (props.width !== null) {
    styles.width = props.width;
  }
  if (props.height !== null) {
    styles.height = props.height;
  }

  return (
    <div className='PanelChart' ref={parentRef} style={styles}>
      <div ref={visRef} className='PanelChart__svg' />
    </div>
  );
}

PanelChart.defaultProps = {
  index: 0,
  width: null,
  height: null,
  ratio: null,
};

PanelChart.propTypes = {
  index: PropTypes.number,
  width: PropTypes.number,
  height: PropTypes.number,
  ratio: PropTypes.number,
};

export default React.memo(PanelChart);
