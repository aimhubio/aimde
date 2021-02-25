import React, { memo, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';

import { HubMainScreenModel } from '../../../../models/HubMainScreenModel';
import PopUp from './PopUp';
import * as classes from '../../../../../../../constants/classes';
import * as storeUtils from '../../../../../../../storeUtils';
import {
  HUB_PROJECT_EXPERIMENT,
  HUB_PROJECT_EXECUTABLE_PROCESS_DETAIL,
  HUB_PROJECT_CREATE_TAG,
} from '../../../../../../../constants/screens';
import UI from '../../../../../../../ui';
import { classNames, buildUrl } from '../../../../../../../utils';

const popUpDefaultWidth = 250;
const popUpDefaultHeight = 250;
const margin = 10;

function PanelPopUps(props) {
  let [chartPopUp, setChartPopUp] = useState({
    display: false,
    left: 0,
    top: 0,
    width: popUpDefaultWidth,
    height: popUpDefaultHeight,
    selectedTags: [],
    selectedTagsLoading: false,
    run: null,
    metric: null,
    trace: null,
    point: null,
  });
  let [tagPopUp, setTagPopUp] = useState({
    display: false,
    isLoading: false,
    left: 0,
    top: 0,
    tags: [],
  });
  let [commitPopUp, setCommitPopUp] = useState({
    display: false,
    isLoading: false,
    left: 0,
    top: 0,
    data: null,
    processKillBtn: {
      loading: false,
      disabled: false,
    },
  });

  const { chart } = HubMainScreenModel.useHubMainScreenState([
    HubMainScreenModel.events.SET_CHART_FOCUSED_STATE,
    HubMainScreenModel.events.SET_CHART_FOCUSED_ACTIVE_STATE,
  ]);

  let {
    isAimRun,
    isTFSummaryScalar,
    getTraceData,
  } = HubMainScreenModel.helpers;

  function positionPopUp(
    x,
    y,
    chained = null,
    popUpWidth = popUpDefaultWidth,
    popUpHeight = popUpDefaultHeight,
  ) {
    const width = window.innerWidth;
    const height = window.innerHeight;

    const leftOverflow = (x) => popUpWidth + x > width;
    const topOverflow = (y) => popUpHeight + y > height;

    let left = 0,
      top = 0,
      chainArrow = null;

    if (chained !== null) {
      if (chained.left + 2 * popUpWidth > width) {
        left = chained.left - popUpWidth;
        chainArrow = 'right';
      } else {
        left = x;
        chainArrow = 'left';
      }
      top = chained.top;
    } else {
      if (leftOverflow(x)) {
        left = x - popUpWidth + margin;
      } else {
        left = x + margin;
      }

      top = y + margin - Math.floor(popUpHeight / 2);

      if (topOverflow(top)) {
        top = height - popUpHeight;
      } else if (top < 0) {
        top = margin;
      }
    }

    return {
      left,
      top,
      width: popUpWidth,
      height: popUpHeight,
      chainArrow,
    };
  }

  function hideActionPopUps(onlySecondary = false) {
    setTagPopUp((tp) => ({
      ...tp,
      display: false,
    }));
    setCommitPopUp((cp) => ({
      ...cp,
      display: false,
    }));
    if (!onlySecondary) {
      setChartPopUp((cp) => ({
        ...cp,
        display: false,
      }));
    }
  }

  function getCommitTags(runHash) {
    props
      .getCommitTags(runHash)
      .then((data) => {
        setChartPopUp((cp) => ({
          ...cp,
          selectedTags: data,
        }));
      })
      .catch(() => {
        setChartPopUp((cp) => ({
          ...cp,
          selectedTags: [],
        }));
      })
      .finally(() => {
        setChartPopUp((cp) => ({
          ...cp,
          selectedTagsLoading: false,
        }));
      });
  }

  function handleTagItemClick(runHash, experimentName, tag) {
    setChartPopUp((cp) => ({
      ...cp,
      selectedTagsLoading: true,
    }));

    props
      .updateCommitTag({
        commit_hash: runHash,
        tag_id: tag.id,
        experiment_name: experimentName,
      })
      .then((tagsIds) => {
        getCommitTags(runHash);
      });
  }

  function handleAttachTagClick() {
    const pos = positionPopUp(
      chartPopUp.left + popUpDefaultWidth,
      chartPopUp.top,
      chartPopUp,
    );

    setTagPopUp((tp) => ({
      ...tp,
      ...pos,
      display: true,
      isLoading: true,
    }));

    hideActionPopUps(true);
    props.getTags().then((data) => {
      setTagPopUp((tp) => ({
        ...tp,
        display: true,
        tags: data,
        isLoading: false,
      }));
    });
  }

  function handleProcessKill(pid, runHash, experimentName) {
    setCommitPopUp((cp) => ({
      ...cp,
      processKillBtn: {
        loading: true,
        disabled: true,
      },
    }));

    props.killRunningExecutable(pid).then((data) => {
      handleCommitInfoClick(runHash, experimentName);
    });
  }

  function handleCommitInfoClick(runHash, experimentName) {
    const pos = positionPopUp(
      chartPopUp.left + popUpDefaultWidth,
      chartPopUp.top,
      chartPopUp,
    );

    hideActionPopUps(true, () => {
      setCommitPopUp((cp) => ({
        ...cp,
        display: true,
        left: pos.left,
        top: pos.top,
        width: pos.width,
        height: pos.height,
        chainArrow: pos.chainArrow,
        processKillBtn: {
          loading: false,
          disabled: false,
        },
        isLoading: true,
      }));

      props.getCommitInfo(experimentName, runHash).then((data) => {
        setCommitPopUp((cp) => ({
          ...cp,
          isLoading: false,
          data,
        }));
      });
    });
  }

  function getPositionBasedOnOverflow(rect, clipPathRect) {
    let left;
    let top;

    if (rect.left < clipPathRect.left) {
      left = clipPathRect.left;
    } else if (rect.left > clipPathRect.left + clipPathRect.width) {
      left = clipPathRect.left + clipPathRect.width;
    } else {
      left = rect.left;
    }

    if (rect.top < clipPathRect.top) {
      top = clipPathRect.top;
    } else if (rect.top > clipPathRect.top + clipPathRect.height) {
      top = clipPathRect.top + clipPathRect.height;
    } else {
      top = rect.top;
    }

    return {
      left,
      top,
    };
  }

  function updatePopUpPosition() {
    const focusedCircle = chart.focused.circle;
    if (focusedCircle.active) {
      const line = getTraceData(
        focusedCircle.runHash,
        focusedCircle.metricName,
        focusedCircle.traceContext,
      );
      hideActionPopUps(true);
      if (line !== null && line.data !== null) {
        setTimeout(() => {
          const activeCircle = document.querySelector('circle.focus');
          if (activeCircle) {
            const circleRect = activeCircle.getBoundingClientRect();
            const topContainer = activeCircle.closest('svg');
            const clipPathElement = topContainer.querySelector('rect');
            const clipPathRect = clipPathElement.getBoundingClientRect();
            const { left, top } = getPositionBasedOnOverflow(
              circleRect,
              clipPathRect,
            );
            const pos = positionPopUp(left, top);
            setChartPopUp((cp) => ({
              ...cp,
              left: pos.left,
              top: pos.top,
              width: pos.width,
              height: pos.height,
            }));
          }
        }, 100);
      }
    }
  }

  useEffect(() => {
    const focusedCircle = chart.focused.circle;
    if (focusedCircle.active) {
      const line = getTraceData(
        focusedCircle.runHash,
        focusedCircle.metricName,
        focusedCircle.traceContext,
      );
      hideActionPopUps(true);
      if (line !== null && line.data !== null) {
        const point =
          line?.data?.[line?.axisValues?.indexOf(focusedCircle.step)] ?? [];
        setChartPopUp((cp) => ({
          ...cp,
          selectedTags: [],
          selectedTagsLoading: true,
        }));
        setTimeout(() => {
          const activeCircle = document.querySelector('circle.focus');
          if (activeCircle) {
            const circleRect = activeCircle.getBoundingClientRect();
            const topContainer = activeCircle.closest('svg');
            const clipPathElement = topContainer.querySelector('rect');
            const clipPathRect = clipPathElement.getBoundingClientRect();
            const { left, top } = getPositionBasedOnOverflow(
              circleRect,
              clipPathRect,
            );
            const pos = positionPopUp(left, top);
            setChartPopUp((cp) => ({
              ...cp,
              left: pos.left,
              top: pos.top,
              width: pos.width,
              height: pos.height,
              display: true,
              run: line.run,
              metric: line.metric,
              trace: line.trace,
              point: point,
            }));
          }
        }, 100);
        if (isAimRun(line.run)) {
          getCommitTags(line.run.run_hash);
        }
      } else {
        hideActionPopUps(false);
      }
    } else {
      hideActionPopUps(false);
    }
  }, [chart.focused.circle]);

  useEffect(() => {
    updatePopUpPosition();
  }, [props.panelWidth, props.panelHeight]);

  useEffect(() => {
    const subscription = HubMainScreenModel.subscribe(
      [
        HubMainScreenModel.events.SET_TRACE_LIST,
        HubMainScreenModel.events.SET_CHART_SETTINGS_STATE,
      ],
      updatePopUpPosition,
    );

    return () => {
      subscription.unsubscribe();
    };
  });

  return (
    <div className='PanelChart__body'>
      {chartPopUp.display && (
        <PopUp
          className='ChartPopUp'
          left={chartPopUp.left}
          top={chartPopUp.top}
          width={chartPopUp.width}
          height={chartPopUp.height}
          xGap={true}
        >
          <div>
            {!chartPopUp.selectedTagsLoading ? (
              <div className='PanelChart__popup__tags__wrapper'>
                <UI.Text overline type='grey-darker'>
                  tag
                </UI.Text>
                <div className='PanelChart__popup__tags'>
                  {chartPopUp.selectedTags.length ? (
                    <>
                      {chartPopUp.selectedTags.map((tagItem, i) => (
                        <UI.Label key={i} color={tagItem.color}>
                          {tagItem.name}
                        </UI.Label>
                      ))}
                    </>
                  ) : (
                    <UI.Label>No attached tag</UI.Label>
                  )}
                  <div
                    className='PanelChart__popup__tags__update'
                    onClick={handleAttachTagClick}
                  >
                    <UI.Icon i='edit' />
                  </div>
                </div>
              </div>
            ) : (
              <UI.Text type='grey' center spacingTop spacing>
                Loading..
              </UI.Text>
            )}
            <UI.Line />
            {isAimRun(chartPopUp.run) && (
              <div>
                <UI.Text type='grey-dark'>
                  <span>
                    Value: {Math.round(chartPopUp.point[0] * 10e9) / 10e9}
                  </span>
                </UI.Text>
                {chartPopUp.point[2] !== null && (
                  <UI.Text type='grey' small>
                    Epoch: {chartPopUp.point[2]}
                  </UI.Text>
                )}
                <UI.Text type='grey' small>
                  Step: {chartPopUp.point[1]}
                  {isTFSummaryScalar(chartPopUp.run) && (
                    <> (local step: {chartPopUp.point[4]}) </>
                  )}
                </UI.Text>
              </div>
            )}
            {isAimRun(chartPopUp.run) && (
              <>
                <UI.Line />
                <Link
                  to={buildUrl(HUB_PROJECT_EXPERIMENT, {
                    experiment_name: chartPopUp.run.experiment_name,
                    commit_id: chartPopUp.run.run_hash,
                  })}
                >
                  <UI.Text type='primary'>Run Details</UI.Text>
                </Link>
                <UI.Text type='grey' small>
                  Experiment: {chartPopUp.run.experiment_name}
                </UI.Text>
                <UI.Text type='grey' small>
                  Hash: {chartPopUp.run.run_hash}
                </UI.Text>
              </>
            )}
            {isTFSummaryScalar(chartPopUp.run) && (
              <>
                <div className='PanelChart__popup__tags__wrapper'>
                  <UI.Text overline type='grey-darker'>
                    tag
                  </UI.Text>
                  <div className='PanelChart__popup__tags'>
                    <UI.Label>{chartPopUp.metric.tag.name}</UI.Label>
                  </div>
                </div>
                <UI.Line />
                <UI.Text overline type='grey-darker'>
                  tf.summary scalar
                </UI.Text>
                <UI.Text type='grey-dark'>{chartPopUp.run.name}</UI.Text>
                {/*<UI.Text type='grey' small>{moment.unix(run.date).format('HH:mm · D MMM, YY')}</UI.Text>*/}
                <UI.Line />
              </>
            )}
          </div>
        </PopUp>
      )}
      {tagPopUp.display && (
        <PopUp
          className='TagPopUp'
          left={tagPopUp.left}
          top={tagPopUp.top}
          chainArrow={tagPopUp.chainArrow}
          xGap={true}
        >
          {tagPopUp.isLoading ? (
            <UI.Text type='grey' center>
              Loading..
            </UI.Text>
          ) : (
            <div className='TagPopUp__tags'>
              <div className='TagPopUp__tags__title'>
                <UI.Text type='grey' inline>
                  Select a tag
                </UI.Text>
                <Link to={HUB_PROJECT_CREATE_TAG}>
                  <UI.Button type='positive' size='tiny'>
                    Create
                  </UI.Button>
                </Link>
              </div>
              <UI.Line spacing={false} />
              <div className='TagPopUp__tags__box'>
                {!tagPopUp.tags.length && (
                  <UI.Text type='grey' center spacingTop spacing>
                    Empty
                  </UI.Text>
                )}
                {tagPopUp.tags.map((tag, tagKey) => (
                  <UI.Label
                    className={classNames({
                      TagPopUp__tags__item: true,
                      active: chartPopUp.selectedTags
                        .map((i) => i.id)
                        .includes(tag.id),
                    })}
                    key={tagKey}
                    color={tag.color}
                    onClick={() =>
                      handleTagItemClick(
                        chartPopUp.run.run_hash,
                        chartPopUp.run.experiment_name,
                        tag,
                      )
                    }
                  >
                    {tag.name}
                  </UI.Label>
                ))}
              </div>
            </div>
          )}
        </PopUp>
      )}
      {commitPopUp.display && (
        <PopUp
          className='CommitPopUp'
          left={commitPopUp.left}
          top={commitPopUp.top}
          chainArrow={commitPopUp.chainArrow}
          xGap={true}
        >
          {commitPopUp.isLoading ? (
            <UI.Text type='grey' center>
              Loading..
            </UI.Text>
          ) : (
            <>
              {/*<UI.Text type='grey' small>*/}
              {/*  {moment.unix(lineData.date).format('HH:mm · D MMM, YY')}*/}
              {/*</UI.Text>*/}
              <Link
                to={buildUrl(HUB_PROJECT_EXPERIMENT, {
                  experiment_name: chartPopUp.run.experiment_name,
                  commit_id: chartPopUp.run.run_hash,
                })}
              >
                <UI.Text type='primary'>Detailed View</UI.Text>
              </Link>
              <UI.Line />
              <UI.Text type='grey' small>
                Experiment: {chartPopUp.run.experiment_name}
              </UI.Text>
              <UI.Text type='grey' small>
                Hash: {chartPopUp.run.run_hash}
              </UI.Text>
              {!!commitPopUp.data.process && (
                <>
                  <UI.Line />
                  {!!commitPopUp.data.process.uuid && (
                    <Link
                      to={buildUrl(HUB_PROJECT_EXECUTABLE_PROCESS_DETAIL, {
                        process_id: commitPopUp.data.process.uuid,
                      })}
                    >
                      <UI.Text>Process</UI.Text>
                    </Link>
                  )}
                  <UI.Text type='grey' small>
                    Process status:{' '}
                    {commitPopUp.data.process.finish ? 'finished' : 'running'}
                  </UI.Text>
                  {!!commitPopUp.data.process.start_date && (
                    <UI.Text type='grey' small>
                      Time:{' '}
                      {Math.round(
                        commitPopUp.data.process.finish
                          ? commitPopUp.data.date -
                              commitPopUp.data.process.start_date
                          : commitPopUp.data.process.time || '-',
                      )}
                    </UI.Text>
                  )}
                  {!!commitPopUp.data.process.pid && (
                    <div className='CommitPopUp__process'>
                      <UI.Text type='grey' small inline>
                        PID: {commitPopUp.data.process.pid}{' '}
                      </UI.Text>
                      <UI.Button
                        onClick={() =>
                          handleProcessKill(
                            commitPopUp.data.process.pid,
                            chartPoUp.run.run_hash,
                            chartPoUp.run.experiment_name,
                          )
                        }
                        type='negative'
                        size='tiny'
                        inline
                        {...commitPopUp.processKillBtn}
                      >
                        Kill
                      </UI.Button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </PopUp>
      )}
    </div>
  );
}

PanelPopUps.propTypes = {
  panelWidth: PropTypes.number,
  panelHeight: PropTypes.number,
};

export default memo(storeUtils.getWithState(classes.PANEL_POPUPS, PanelPopUps));
