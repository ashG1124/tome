import { COPY } from '../../../shared/copy';
import { RollingBands } from './RollingBands';
import { Shot, StoryTitle, TryRemixButton } from './storyParts';

/**
 * 정지 화면 모드. 연출(pin·스크롤 연동·롤링·말풍선 튀기) 없이 단계마다 최종 그림을 위에서 아래로 나열한다.
 * 움직임 줄이기·느린 PC·`?motion=off` 에서 쓴다. Try Remix 버튼은 Remix with 패널 그림으로 내려 보낸다.
 */
export function StaticStory() {
  const goToPanel = () => {
    document
      .querySelector('[data-static-panel]')
      ?.scrollIntoView({ block: 'center', behavior: 'auto' });
  };
  return (
    <div className="story-static">
      <div className="story-block story-static-bg" data-chapter="mywork">
        <StoryTitle id="mywork" subtitle="ON-24" />
        <div className="story-static-frame">
          <Shot id="home" />
        </div>
        <div className="story-static-frame">
          <Shot id="entry" />
        </div>
        <div className="story-static-label">
          <p className="story-label-text">{COPY['ON-25']}</p>
        </div>
        <div className="story-static-node">
          <Shot id="nodesA" />
        </div>
        <div className="story-static-label">
          <p className="story-label-text">{COPY['ON-26']}</p>
          <p className="story-label-sub">{COPY['ON-27']}</p>
        </div>
        <div className="story-static-node">
          <Shot id="nodesD" />
        </div>
        <div className="story-static-frame">
          <Shot id="zoomout" />
        </div>
      </div>
      <div className="story-block" data-chapter="remix">
        <StoryTitle id="remix" />
        <div className="story-static-frame story-static-frame-wide">
          <Shot id="frameE" />
          <div className="story-bubble-pos">
            <TryRemixButton onPress={goToPanel} onFocus={() => undefined} />
          </div>
        </div>
        <div data-static-panel className="story-static-frame story-static-frame-wide">
          <Shot id="frameF" />
        </div>
        <div className="story-static-frame story-static-frame-wide">
          <Shot id="frameG" />
        </div>
        <p className="story-h-title story-static-h-title">{COPY['ON-29']}</p>
        <div className="story-static-node story-static-node-h">
          <Shot id="nodesH" />
        </div>
      </div>
      <div className="story-block" data-chapter="derive">
        <StoryTitle id="derive" />
        <RollingBands loop={false} />
        <div className="story-static-preview">
          <Shot id="preview" />
        </div>
        <div className="story-static-node story-static-node-remix">
          <Shot id="remixB" />
        </div>
      </div>
    </div>
  );
}
