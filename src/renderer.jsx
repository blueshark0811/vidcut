const electron = require('electron'); // eslint-disable-line
const $ = require('jquery');
const keyboardJs = require('keyboardjs');
const ffmpeg = require('./ffmpeg');
const _ = require('lodash');
const captureFrame = require('capture-frame');
const fs = require('fs');

const React = require('react');
const ReactDOM = require('react-dom');
const classnames = require('classnames');

function formatDuration(_seconds) {
  const seconds = _seconds || 0;
  const minutes = seconds / 60;
  const hours = minutes / 60;

  const hoursPadded = _.padStart(Math.floor(hours), 2, '0');
  const minutesPadded = _.padStart(Math.floor(minutes % 60), 2, '0');
  const secondsPadded = _.padStart(Math.floor(seconds) % 60, 2, '0');
  const msPadded = _.padStart(Math.floor((seconds - Math.floor(seconds)) * 1000), 3, '0');

  // Be nice to filenames and use .
  return `${hoursPadded}.${minutesPadded}.${secondsPadded}.${msPadded}`;
}

function getVideo() {
  return $('#player video')[0];
}

function seekAbs(val) {
  const video = getVideo();
  let outVal = val;
  if (outVal < 0) outVal = 0;
  if (outVal > video.duration) outVal = video.duration;

  video.currentTime = outVal;
}

function setCursor(val) {
  seekAbs(val);
}

function seekRel(val) {
  seekAbs(getVideo().currentTime + val);
}

function shortStep(dir) {
  seekRel((1 / 60) * dir);
}


class App extends React.Component {
  constructor(props) {
    super(props);

    const defaultState = {
      working: false,
      filePath: '', // Setting video src="" prevents memory leak
      playing: false,
      currentTime: undefined,
      duration: undefined,
      cutStartTime: 0,
      cutEndTime: undefined,
    };

    this.state = _.cloneDeep(defaultState);

    const resetState = () => this.setState(defaultState);

    const load = (filePath) => {
      resetState();
      this.setState({ filePath });
    };

    electron.ipcRenderer.on('file-opened', (event, message) => {
      if (!message) return;
      load(message);
    });

    document.ondragover = document.ondragend = ev => ev.preventDefault();

    document.body.ondrop = (ev) => {
      ev.preventDefault();
      if (ev.dataTransfer.files.length !== 1) return;
      load(ev.dataTransfer.files[0].path);
    };

    keyboardJs.bind('space', () => this.playCommand());
    keyboardJs.bind('left', () => seekRel(-1));
    keyboardJs.bind('right', () => seekRel(1));
    keyboardJs.bind('period', () => shortStep(1));
    keyboardJs.bind('comma', () => shortStep(-1));
    keyboardJs.bind('c', this.capture);
  }

  mouseDown(e) {
    const $target = $('.timeline-wrapper'); // $(e.target);
    const parentOffset = $target.offset();
    const relX = e.pageX - parentOffset.left;
    setCursor((relX / $target[0].offsetWidth) * this.state.duration);
  }

  playCommand() {
    getVideo()[this.state.playing ? 'pause' : 'play']();
  }

  cutClick() {
    const cutStartTime = this.state.cutStartTime;
    const cutEndTime = this.state.cutEndTime;
    const filePath = this.state.filePath;
    if (cutStartTime === undefined || cutEndTime === undefined) {
      return alert('Please select both start and time');
    }
    if (cutStartTime >= cutEndTime) {
      return alert('Start time must be before end time');
    }

    this.setState({ working: true });
    const ext = 'mp4';
    const outFileAppend = `${formatDuration(cutStartTime)}-${formatDuration(cutEndTime)}`;
    const outPath = `${filePath}-${outFileAppend}.${ext}`;
    return ffmpeg.cut(filePath, cutStartTime, cutEndTime, outPath)
      .finally(() => this.setState({ working: false }));
  }

  capture() {
    const buf = captureFrame(getVideo(), 'jpg');
    const outPath = `${this.state.filePath}-${formatDuration(this.state.currentTime)}.jpg`;
    fs.writeFile(outPath, buf, (err) => {
      if (err) alert(err);
    });
  }

  render() {
    return (<div>
      {this.state.filePath ? undefined : <div id="drag-drop-field">DROP VIDEO</div>}
      {this.state.working ? <div id="working"><i className="fa fa-cog fa-spin fa-3x fa-fw" /></div>
        : undefined}

      <div id="player">
        <video
          src={this.state.filePath}
          onPlay={() => this.setState({ playing: true })}
          onPause={() => this.setState({ playing: false })}
          onDurationChange={e => this.setState({ duration: e.target.duration })}
          onTimeUpdate={e => this.setState({ currentTime: e.target.currentTime })}
        />
      </div>

      <div className="controls-wrapper">
        <div className="timeline-wrapper" onMouseDown={e => this.mouseDown(e)}>
          <div className="current-time" style={{ left: `${(this.state.currentTime / this.state.duration) * 100}%` }} />
          <div
            className="cut-start-time"
            style={{
              left: `${(this.state.cutStartTime / this.state.duration) * 100}%`,
              width: `${((this.state.cutEndTime - this.state.cutStartTime) / this.state.duration) * 100}%`,
            }}
          />

          <div id="current-time-display">{formatDuration(this.state.currentTime)}</div>
        </div>

        <i
          id="seek-start"
          className="fa fa-step-backward"
          aria-hidden="true"
          onClick={() => seekAbs(0)}
        />
        <i
          id="play"
          className={classnames({ fa: true, 'fa-pause': this.state.playing, 'fa-play': !this.state.playing })}
          aria-hidden="true"
          onClick={() => this.playCommand()}
        />
        <i
          id="seek-end"
          className="fa fa-step-forward"
          aria-hidden="true"
          onClick={() => seekAbs(this.state.duration)}
        />
        <i
          id="short-step"
          title="Short step"
          className="fa fa-ellipsis-h"
          aria-hidden="true"
          onClick={() => shortStep(1)}
        />
        <br />
        <i
          id="set-start"
          title="Set cut start"
          className="fa fa-angle-left"
          aria-hidden="true"
          onClick={() => this.setState({ cutStartTime: this.state.currentTime })}
        />
        <i
          id="cut"
          title="Cut/export"
          className="fa fa-scissors"
          aria-hidden="true"
          onClick={() => this.cutClick()}
        />
        <i
          id="set-end"
          title="Set cut end"
          className="fa fa-angle-right"
          aria-hidden="true"
          onClick={() => this.setState({ cutEndTime: this.state.currentTime })}
        />
        <i
          id="capture-frame"
          title="Capture frame"
          className="fa fa-camera"
          aria-hidden="true"
          onClick={() => this.capture()}
        />
      </div>
    </div>);
  }
}

ReactDOM.render(<App />, document.getElementById('app'));
