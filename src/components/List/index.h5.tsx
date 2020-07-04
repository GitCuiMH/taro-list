import Taro, { PureComponent } from '@tarojs/taro';
import { View, ScrollView } from '@tarojs/components';

import VirtualList from './VirtualList';
import { ListProps, ListPropTypes } from './types';
import {
  MAX_REFRESHING_TIME,
  HEIGHT,
  DISTANCE_TO_REFRESH,
  DAMPING,
  REFRESH_STATUS,
  REFRESH_STATUS_TEXT
} from './config';
import { ComponentResizeObserver } from './ComponentResizeObserver';
import './index.less';

interface ListState {
  containerSize: number;
  status: REFRESH_STATUS;
  draging: boolean;
  offset: number;
}

const opts = {
  passive: false
};

export default class TaroList extends PureComponent<ListProps, ListState> {
  static defaultProps: Partial<ListProps> = {
    height: HEIGHT,
    className: '',
    width: '100%',
    distanceToRefresh: DISTANCE_TO_REFRESH,
    damping: DAMPING
  };

  static propTypes = ListPropTypes;

  static options = {
    addGlobalClass: true
  };

  static index = 0;

  private rootNode: HTMLDivElement;
  private refreshTimer: number = 0;
  private initialY = 0;
  private virtualListRef = Taro.createRef<VirtualList>();
  private down = false;

  private domId = `zyouh-list__id-${TaroList.index++}`;

  constructor(props: ListProps) {
    super(props);

    this.state = {
      containerSize: 0,
      status: REFRESH_STATUS.NONE,
      draging: false,
      offset: 0
    };
  }

  componentDidMount() {
    this.getRootNode();
    this.addEventListener();

    if (!this.props.disabled) {
      this.triggerRefresh();
    }

    if (this.props.virtual) {
      this.setVirtualListHeight();
    }
  }

  componentDidUpdate(prevProps: ListProps) {
    const { refreshing, virtual, height, disabled } = this.props;

    if (prevProps.refreshing !== refreshing && !disabled) {
      this.triggerRefresh();
    } else if (prevProps.disabled !== disabled && disabled) {
      this.reset();
    }

    const offset = this.getScrollOffset();

    if (virtual && this.virtualListRef.current) {
      this.virtualListRef.current.setScrollOffset(offset);
    }

    if (virtual && height !== prevProps.height) {
      this.setVirtualListHeight();
    }
  }

  componentWillUnmount() {
    this.clearRefreshTimer();
    this.removeEventListener();
  }

  private setVirtualListHeight = () => {
    this.setState({
      containerSize: this.rootNode.offsetHeight
    });
  };

  private onScrollOffsetChange = (offset: number) => {
    this.rootNode.scrollTop = offset;
  };

  private handleTouchStart = (evt: TouchEvent) => {
    const touchList = evt.touches;

    if (this.state.status === REFRESH_STATUS.RELEASE) {
      this.cancelEvent(evt);
      return;
    } else if (!this.down && touchList.length === 1 && this.checkShouldPull()) {
      this.setState({
        draging: true
      });

      this.down = true;
      this.initialY = touchList[0].clientY;
    }
  };

  private handleTouchMove = (evt: TouchEvent) => {
    if (evt.touches.length > 1 || !this.down) {
      return;
    }

    const y = evt.touches[0].clientY;
    const { status, offset } = this.state;

    if (status === REFRESH_STATUS.RELEASE) {
      this.cancelEvent(evt);
      return;
    }

    // 如果 offset 大于0 处于拖动中或者好 release
    if ((y < this.initialY && offset < 1) || this.props.disabled) {
      return;
    }

    this.cancelEvent(evt);

    const deltaY = this.damping(y - this.initialY);

    this.updateOffset(deltaY);

    if (deltaY < this.props.distanceToRefresh!) {
      if (status !== REFRESH_STATUS.PULL) {
        this.setState({
          status: REFRESH_STATUS.PULL
        });
      }
    } else {
      if (status !== REFRESH_STATUS.ACTIVE) {
        this.setState({
          status: REFRESH_STATUS.ACTIVE
        });
      }
    }
  };

  private handleTouchEnd = () => {
    const { status, draging } = this.state;

    this.down = false;

    if (status === REFRESH_STATUS.RELEASE) {
      return;
    }

    if (draging) {
      this.setState(() => ({
        draging: false
      }));
    }

    if (status === REFRESH_STATUS.ACTIVE) {
      this.setRefresh();
    } else {
      this.reset();
    }
  };

  private handleScroll = () => {
    const offset = this.getScrollOffset();

    if (this.props.virtual && this.virtualListRef.current) {
      this.virtualListRef.current.setScrollOffset(offset);
    }
  };

  private setRefresh() {
    const { distanceToRefresh, onRefresh } = this.props;

    this.setState(
      {
        status: REFRESH_STATUS.RELEASE
      },
      () => this.updateOffset(distanceToRefresh!)
    );

    const onEnd = () => {
      this.clearRefreshTimer();
      if (!this.props.refreshing) {
        this.reset();
      }
    };

    this.clearRefreshTimer();
    this.refreshTimer = window.setTimeout(() => {
      onEnd();
    }, MAX_REFRESHING_TIME);

    if (typeof onRefresh === 'function') {
      onRefresh(onEnd);
    }
  }

  private triggerRefresh = () => {
    const { refreshing } = this.props;

    if (this.state.draging) {
      return;
    }

    if (refreshing) {
      this.setRefresh();
    } else {
      this.reset();
    }
  };

  private reset = () => {
    this.initialY = 0;
    this.updateOffset(0);
    this.setState({
      status: REFRESH_STATUS.NONE
    });
  };

  private cancelEvent = (evt: UIEvent) => {
    evt.preventDefault();
    evt.stopPropagation();
  };

  private clearRefreshTimer = () => {
    clearTimeout(this.refreshTimer);
  };

  private updateOffset = (offset: number) => {
    if (this.state.offset !== offset) {
      this.setState({
        offset
      });
    }
  };

  private handleScrollToLower = () => {
    const { onLoadMore } = this.props;

    if (typeof onLoadMore === 'function') {
      onLoadMore();
    }
  };

  render() {
    const props = this.props;
    const {
      height,
      width,
      style,
      className,
      custom,
      distanceToRefresh,
      virtual,
      scrollToIndex,
      enableBackToTop,
      scrollWithAnimation,
      dataManager,
      showRefreshText,
      onVirtualListInit
    } = props;
    const { draging, status, offset, containerSize } = this.state;

    const cls = `zyouh-list__container ${className || ''}`.trim();
    const bodyCls = `zyouh-list__body ${
      !draging ? 'zyouh-list__body-transition' : ''
    }`.trim();

    const bodyStyle: React.CSSProperties = {
      transform: `translate3d(0, ${offset}px, 0px)`
    };
    const normalIndicatorStyle: React.CSSProperties = {
      height: distanceToRefresh,
      transform: `translate3d(0, ${-distanceToRefresh! +
        Math.min(offset, distanceToRefresh!)}px, 0)`
    };

    return (
      <ComponentResizeObserver onResize={this.setVirtualListHeight}>
        <View style={style} className={cls}>
          <ScrollView
            id={this.domId}
            onScroll={this.handleScroll}
            scrollWithAnimation={scrollWithAnimation}
            enableBackToTop={enableBackToTop}
            style={{ width, height }}
            className='zyouh-list__scroller-view'
            onScrollToLower={this.handleScrollToLower}
            scrollY
          >
            {!custom && (
              <View
                style={normalIndicatorStyle}
                className={`zyouh-list__indicator-container ${
                  showRefreshText ? 'zyouh-list__indicator-container--row' : ''
                }${
                  status === REFRESH_STATUS.RELEASE ? ' flashing' : ''
                }`.trim()}
              >
                <View className='zyouh-list__indicator zyouh-list__indicator--dot'>
                  <View className='zyouh-list__indicator-dot'></View>
                  <View className='zyouh-list__indicator-dot'></View>
                  <View className='zyouh-list__indicator-dot'></View>
                </View>

                {showRefreshText && (
                  <View className='zyouh-list__indicator-text'>
                    {REFRESH_STATUS_TEXT[status]}
                  </View>
                )}
              </View>
            )}
            <View style={bodyStyle} className={bodyCls}>
              {virtual ? (
                <VirtualList
                  width={width}
                  ref={this.virtualListRef}
                  height={containerSize}
                  dataManager={dataManager}
                  scrollToIndex={scrollToIndex}
                  onOffsetChange={this.onScrollOffsetChange}
                  onVirtualListInit={onVirtualListInit}
                >
                  {props.children}
                </VirtualList>
              ) : (
                props.children
              )}
            </View>
          </ScrollView>
        </View>
      </ComponentResizeObserver>
    );
  }

  private addEventListener() {
    this.rootNode.addEventListener('touchstart', this.handleTouchStart, opts);
    this.rootNode.addEventListener('touchmove', this.handleTouchMove, opts);
    this.rootNode.addEventListener('touchend', this.handleTouchEnd, opts);
    this.rootNode.addEventListener('touchcancel', this.handleTouchEnd, opts);
  }

  private removeEventListener() {
    this.rootNode.removeEventListener('touchstart', this.handleTouchStart);
    this.rootNode.removeEventListener('touchmove', this.handleTouchMove);
    this.rootNode.removeEventListener('touchend', this.handleTouchEnd);
    this.rootNode.removeEventListener('touchcancel', this.handleTouchEnd);
  }

  private damping(offset: number) {
    const { distanceToRefresh, damping } = this.props;

    return offset > distanceToRefresh!
      ? Math.min(damping!, offset / (1 + Math.abs(offset) * 0.002))
      : offset;
  }

  private getRootNode() {
    this.rootNode = document.querySelector('#' + this.domId) as HTMLDivElement;
  }

  private checkShouldPull() {
    return this.getScrollOffset() >= 0 && this.getScrollOffset() < 1;
  }

  private getScrollOffset() {
    return (this.rootNode && Math.floor(this.rootNode.scrollTop)) || 0;
  }
}
