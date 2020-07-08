import React, { PureComponent } from "react";
import PropTypes from "prop-types";
import { LazyBrush } from "lazy-brush";
import { Catenary } from "catenary-curve";

import ResizeObserver from "resize-observer-polyfill";

import drawImage from "./drawImage";

function midPointBtw(p1, p2) {
  return {
    x: p1.x + (p2.x - p1.x) / 2,
    y: p1.y + (p2.y - p1.y) / 2
  };
}

const canvasStyle = {
  display: "block",
  position: "absolute"
};

const canvasTypes = [
  {
    name: "interface",
    zIndex: 15
  },
  {
    name: "lines",
    zIndex: 11
  },
  {
    name: "points",
    zIndex: 12
  },
  {
    name: "grid",
    zIndex: 10
  }
];

const dimensionsPropTypes = PropTypes.oneOfType([
  PropTypes.number,
  PropTypes.string
]);

export default class extends PureComponent {
  static propTypes = {
    onChange: PropTypes.func,
    animationSpeed: PropTypes.number,
    lazyRadius: PropTypes.number,
    brushRadius: PropTypes.number,
    brushColor: PropTypes.string,
    catenaryColor: PropTypes.string,
    gridColor: PropTypes.string,
    backgroundColor: PropTypes.string,
    hideGrid: PropTypes.bool,
    canvasWidth: dimensionsPropTypes,
    canvasHeight: dimensionsPropTypes,
    disabled: PropTypes.bool,
    imgSrc: PropTypes.string,
    immediateDraw: PropTypes.bool,
    hideInterface: PropTypes.bool
  };

  static defaultProps = {
    onChange: null,
    animationSpeed: 2,
    lazyRadius: 12,
    brushRadius: 10,
    brushColor: "#444",
    catenaryColor: "#0a0302",
    gridColor: "rgba(150,150,150,0.17)",
    backgroundColor: "#FFF",
    hideGrid: false,
    canvasWidth: 400,
    canvasHeight: 400,
    disabled: false,
    imgSrc: "",
    immediateDraw: false,
    hideInterface: false
  };

  constructor(props) {
    super(props);

    this.canvas = {};
    this.ctx = {};

    this.catenary = new Catenary();
    this.lines = [];
    this.points = [];

    this.mouseHasMoved = true;
    this.valuesChanged = true;
    this.isDrawing = false;
    this.isPressing = false;

    this.hideInterface = false;

    this.linesAnimationTowards = null;
    this.linesAnimationState = {
      lineIndex: -1,
      pointIndex: -1,
      lastUpdate: 0,
    };
  }

  componentDidMount() {
    this.lazy = new LazyBrush({
      radius: this.props.lazyRadius * window.devicePixelRatio,
      enabled: true,
      initialPoint: {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
      }
    });
    this.chainLength = this.props.lazyRadius * window.devicePixelRatio;

    this.canvasObserver = new ResizeObserver((entries, observer) =>
      this.handleCanvasResize(entries, observer)
    );
    this.canvasObserver.observe(this.canvasContainer);

    this.updateImage();
    this.loop();

    const initX = window.innerWidth / 2;
    const initY = window.innerHeight / 2;
    this.lazy.update(
      { x: initX - this.chainLength / 4, y: initY },
      { both: true }
    );
    this.lazy.update(
      { x: initX + this.chainLength / 4, y: initY },
      { both: false }
    );
    this.mouseHasMoved = true;
    this.valuesChanged = true;
  }

  componentDidUpdate(prevProps) {
    if (prevProps.lazyRadius !== this.props.lazyRadius) {
      // Set new lazyRadius values
      this.chainLength = this.props.lazyRadius * window.devicePixelRatio;
      this.lazy.setRadius(this.props.lazyRadius * window.devicePixelRatio);
    }

    if (prevProps.imgSrc != this.props.imgSrc) {
      this.updateImage();
    }

    if (prevProps.lines != this.props.lines) {
      this.props.lines.forEach(line => {
        if (line.points.length === 0) {
          throw new Error('Invalid lines, must have at least 1 point');
        }
      });
    }

    const propKeys = Object.keys(this.props);
    for (let i = 0; i < propKeys.length; ++i) {
      const key = PropTypes[i];
      if (this.props[key] != prevProps[key]) {
        this.valuesChanged = true;
        break;
      }
    }

    // Note: other components will be handled by draw loop
  }

  componentWillUnmount = () => {
    this.canvasObserver.unobserve(this.canvasContainer);
  };

  updateImage = () => {
    if (!this.props.imgSrc) return;

    // Load the image
    this.image = new Image();

    // Prevent SecurityError "Tainted canvases may not be exported." #70
    this.image.crossOrigin = "anonymous";

    // Draw the image once loaded
    this.image.onload = () =>
      drawImage({ ctx: this.ctx.grid, img: this.image });
    this.image.src = this.props.imgSrc;
  };

  handleDrawStart = e => {
    e.preventDefault();
    if (this.linesAnimationTowards) return;

    // Start drawing
    this.isPressing = true;

    const { x, y } = this.getPointerPos(e);

    if (e.touches && e.touches.length > 0) {
      // on touch, set catenary position to touch pos
      this.lazy.update({ x, y }, { both: true });
    }

    // Ensure the initial down position gets added to our line
    this.handlePointerMove(x, y);
  };

  handleEnter = e => {
    this.hideInterface = false;
    this.valuesChanged = true;
  }

  handleLeave = e => {
    this.hideInterface = true;
    this.valuesChanged = true;
  }

  handleDrawMove = e => {
    e.preventDefault();

    const { x, y } = this.getPointerPos(e);
    this.handlePointerMove(x, y);
  };

  handleDrawEnd = e => {
    e.preventDefault();
    if (this.linesAnimationTowards) return;

    // Draw to this end pos
    this.handleDrawMove(e);

    // Stop drawing & save the drawn line
    this.isDrawing = false;
    this.isPressing = false;

    const points = this.points;
    this.points = [];

    // Need at least a line :|
    if (points.length < 2) {
      return;
    }

    const newLine = {
      points,
      brushColor: this.props.brushColor,
      brushRadius: this.props.brushRadius
    };

    this.movePointsToLines();
    this.lines = [ ...this.lines, newLine ];
    this.props.onChange && this.props.onChange(this.lines);
  };

  handleCanvasResize = (entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      this.setCanvasSize(this.canvas.interface, width, height);
      this.setCanvasSize(this.canvas.lines, width, height);
      this.setCanvasSize(this.canvas.points, width, height);
      this.setCanvasSize(this.canvas.grid, width, height);

      this.drawGrid(this.ctx.grid);
      this.updateImage();
      this.loop(true);
    }
  };

  setCanvasSize = (canvas, width, height) => {
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = width;
    canvas.style.height = height;
  };

  getPointerPos = e => {
    const rect = this.canvas.interface.getBoundingClientRect();

    // use cursor pos as default
    let clientX = e.clientX;
    let clientY = e.clientY;

    // use first touch if available
    if (e.changedTouches && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    }

    // return mouse/touch position inside canvas
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  handlePointerMove = (x, y) => {
    if (this.props.disabled) return;
    if (this.linesAnimationTowards) return;

    this.lazy.update({ x, y });
    const isDisabled = !this.lazy.isEnabled();

    if (
      (this.isPressing && !this.isDrawing) ||
      (isDisabled && this.isPressing)
    ) {
      // Start drawing and add point
      this.isDrawing = true;
      this.points.push(this.lazy.brush.toObject());
    }

    if (this.isDrawing) {
      // Add new point
      this.points.push(this.lazy.brush.toObject());
    }

    this.mouseHasMoved = true;
  };

  drawPoints = ({ points, brushColor, brushRadius, _tillIdx }, canvas = 'points') => {
    if (points.length < 2) {
      return;
    }

    const ctx = this.ctx[canvas];

    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushRadius * 2;

    let p1 = points[0];
    let p2 = points[1];

    ctx.moveTo(p2.x, p2.y);
    ctx.beginPath();

    const len = _tillIdx ? Math.min(_tillIdx, points.length) : points.length;
    for (let i = 1; i < len; i++) {
      // we pick the point between pi+1 & pi+2 as the
      // end point and p1 as our control point
      var midPoint = midPointBtw(p1, p2);
      ctx.quadraticCurveTo(p1.x, p1.y, midPoint.x, midPoint.y);
      p1 = points[i];
      p2 = points[i + 1];
    }
    // Draw last line as a straight line while
    // we wait for the next point to be able to calculate
    // the bezier control point
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  };

  movePointsToLines = () => {
    const width = this.canvas.points.width;
    const height = this.canvas.points.height;

    // Copy the line to the drawing canvas
    this.ctx.lines.drawImage(this.canvas.points, 0, 0, width, height);

    // Clear the temporary line-drawing canvas
    this.ctx.points.clearRect(0, 0, width, height);
  }

  drawLine = (line) => {
    this.drawPoints(line, 'lines');
  };

  triggerOnChange = () => {
    this.props.onChange && this.props.onChange(this);
  };

  clearLines = () => {
    this.ctx.lines.clearRect(
      0,
      0,
      this.canvas.lines.width,
      this.canvas.lines.height
    );
  }

  clearPoints = () => {
    this.ctx.points.clearRect(
      0,
      0,
      this.canvas.points.width,
      this.canvas.points.height
    );
  }

  loop = (force = false) => {
    if (force || this.mouseHasMoved || this.valuesChanged) {
      const pointer = this.lazy.getPointerCoordinates();
      const brush = this.lazy.getBrushCoordinates();

      this.drawInterface(this.ctx.interface, pointer, brush);
      this.mouseHasMoved = false;
      this.valuesChanged = false;
    }

    const now = Date.now();

    if (this.linesAnimationTowards) {
      /* make sure our animation target didn't move */
      if (this.linesAnimationTowards !== this.props.lines) {
        /* update to refelect what we have current animated */
        this.lines = [];
        for (let i = 0; i < this.linesAnimationState.lineIndex; ++i)  {
          this.lines.push(this.linesAnimationTowards[i]);
        }

        if (this.linesAnimationState.pointIndex > 0) {
          const lastLinePoints = [];
          for (let i = 0; i < this.linesAnimationState.pointIndex; ++i) {
            lastLinePoints.push(this.linesAnimationTowards[this.lines.length].points[i]);
          }
          this.lines.push({
            ...this.linesAnimationTowards[this.lines.length],
            points: lastLinePoints,
          });
        }

        this.linesAnimationTowards = null;
      }
      /* continue animation */
      else {
        const waitTime = (now - this.linesAnimationState.lastUpdate);
        let pointCount = Math.floor(waitTime * this.props.animationSpeed);
        this.linesAnimationState.lastUpdate = now;

        while (pointCount > 0) {
          this.clearPoints();

          const line = this.lines[this.linesAnimationState.lineIndex];
          const pointsLen = this.linesAnimationState.pointIndex + pointCount;

          if (pointsLen >= line.points.length) {
            this.drawLine(line);
            this.linesAnimationState.lineIndex += 1;
            this.linesAnimationState.pointIndex = 0;

            const taken = pointsLen - line.points.length;
            pointCount -= taken;

            /* is the animation done? */
            if (this.linesAnimationState.lineIndex >= this.lines.length) {
              this.linesAnimationTowards = null;
              break;
            }

            continue;
          }

          this.drawPoints({ ...line, _tillIdx: pointsLen })
          this.linesAnimationState.pointIndex = pointsLen;

          pointCount = 0;
          break;
        }
      }
    }

    /* do not run regular render when animating */
    if (!this.linesAnimationTowards) {
      if (force || this.isDrawing) {
        this.clearPoints();
        this.drawPoints({
          points: this.points,
          brushColor: this.props.brushColor,
          brushRadius: this.props.brushRadius
        });
      }

      let linesRedrawn = false;
      if (this.lines !== this.props.lines) {
        if (this.props.lines.length === 0) {
          this.clearLines();
          this.lines = this.props.lines;
          linesRedrawn = true;
        }
        else {
          /* find how many lines are common */
          let commonLineCount = 0;
          let commonPoints = 0;
          while (commonLineCount < this.lines.length && commonLineCount < this.props.lines.length) {
            commonPoints = 0;

            const a = this.lines[commonLineCount].points;
            const b = this.props.lines[commonLineCount].points;

            if (a !== b) {
              let same = true;
              while (commonPoints < a.length && commonPoints < b.length) {
                const ap = a[commonPoints];
                const bp = b[commonPoints];

                if (ap !== bp && (ap.x !== bp.x || ap.y !== bp.y)) {
                  same = false;
                  break;
                }

                commonPoints += 1;
              }

              if (!same || a.length !== b.length) {
                break;
              }
            }

            commonLineCount += 1;
          }

          /* lines are already drawn, just need to remove more recent */
          if (commonLineCount === this.props.lines.length || this.props.immediateDraw) {
            this.clearLines();
            this.lines = this.props.lines;
            this.lines.forEach(this.drawLine);
            linesRedrawn = true;
          }
          /* we're going to animate :) */
          else {
            this.linesAnimationTowards = this.props.lines;
            this.linesAnimationState.lineIndex = commonLineCount;
            this.linesAnimationState.pointIndex = commonPoints;
            this.linesAnimationState.lastUpdate = Date.now() -  (1 / this.props.animationSpeed) * 1.01;
            this.lines = this.props.lines;

            /* reset stuff so we can't draw while animating */
            this.points.length = 0;
            this.clearPoints();
            this.clearLines();

            /* draw common to have shared base */
            for (let i = 0; i < commonLineCount; ++i) {
              this.drawLine(this.lines[i]);
            }

            return this.loop();
          }
        }
      }

      if (force && !linesRedrawn) {
        this.clearLines();
        this.lines.forEach(this.drawLine);
      }
    }

    if (!force) {
      window.requestAnimationFrame(() => {
        this.loop();
      });
    }
  };

  drawGrid = ctx => {
    if (this.props.hideGrid) return;

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    ctx.beginPath();
    ctx.setLineDash([5, 1]);
    ctx.setLineDash([]);
    ctx.strokeStyle = this.props.gridColor;
    ctx.lineWidth = 0.5;

    const gridSize = 25;

    let countX = 0;
    while (countX < ctx.canvas.width) {
      countX += gridSize;
      ctx.moveTo(countX, 0);
      ctx.lineTo(countX, ctx.canvas.height);
    }
    ctx.stroke();

    let countY = 0;
    while (countY < ctx.canvas.height) {
      countY += gridSize;
      ctx.moveTo(0, countY);
      ctx.lineTo(ctx.canvas.width, countY);
    }
    ctx.stroke();
  };

  drawInterface = (ctx, pointer, brush) => {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    if (this.props.hideInterface || this.hideInterface) return;

    // Draw brush preview
    ctx.beginPath();
    ctx.fillStyle = this.props.brushColor;
    ctx.arc(brush.x, brush.y, this.props.brushRadius, 0, Math.PI * 2, true);
    ctx.fill();

    // Draw mouse point (the one directly at the cursor)
    ctx.beginPath();
    ctx.fillStyle = this.props.catenaryColor;
    ctx.arc(pointer.x, pointer.y, 4, 0, Math.PI * 2, true);
    ctx.fill();

    // Draw catenary
    if (this.lazy.isEnabled()) {
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = this.props.catenaryColor;
      this.catenary.drawToCanvas(
        this.ctx.interface,
        brush,
        pointer,
        this.chainLength
      );
      ctx.stroke();
    }

    // Draw brush point (the one in the middle of the brush preview)
    ctx.beginPath();
    ctx.fillStyle = this.props.catenaryColor;
    ctx.arc(brush.x, brush.y, 2, 0, Math.PI * 2, true);
    ctx.fill();
  };

  render() {
    return (
      <div
        className={this.props.className}
        style={{
          display: "block",
          background: this.props.backgroundColor,
          touchAction: "none",
          width: this.props.canvasWidth,
          height: this.props.canvasHeight,
          ...this.props.style
        }}
        ref={container => {
          if (container) {
            this.canvasContainer = container;
          }
        }}
      >
        {canvasTypes.map(({ name, zIndex }) => {
          const isInterface = name === "interface";
          return (
            <canvas
              key={name}
              ref={canvas => {
                if (canvas) {
                  this.canvas[name] = canvas;
                  this.ctx[name] = canvas.getContext("2d");
                }
              }}
              style={{ ...canvasStyle, zIndex }}
              onMouseEnter={isInterface ? this.handleEnter : undefined}
              onMouseLeave={isInterface ? this.handleLeave : undefined}
              onMouseDown={isInterface ? this.handleDrawStart : undefined}
              onMouseMove={isInterface ? this.handleDrawMove : undefined}
              onMouseUp={isInterface ? this.handleDrawEnd : undefined}
              onMouseOut={isInterface ? this.handleDrawEnd : undefined}
              onTouchStart={isInterface ? this.handleDrawStart : undefined}
              onTouchMove={isInterface ? this.handleDrawMove : undefined}
              onTouchEnd={isInterface ? this.handleDrawEnd : undefined}
              onTouchCancel={isInterface ? this.handleDrawEnd : undefined}
            />
          );
        })}
      </div>
    );
  }
}
