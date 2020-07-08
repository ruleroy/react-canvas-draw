import React, { useState } from "react";
import { render } from "react-dom";

import CanvasDraw from "../../src";
import classNames from "./index.css";

const Demo = () => {
  const [ lines, setLines ] = useState([]);
  const [ redoLines, setRedoLines ] = useState({ lines: [], currentLineCount: 0, });

  const updateLines = (delta) => {
    setRedoLines(state => {
      const targetCount = state.currentLineCount + delta;
      if (targetCount < 0 || targetCount > state.lines.length) {
        return state;
      }

      const lines = [];
      for (let i = 0; i < targetCount; ++i) {
        lines.push(state.lines[i]);
      }
      setLines(lines);

      console.log('setLines', lines);

      return {
        lines: state.lines,
        currentLineCount: targetCount,
      };
    });
  };

  return (
    <div>
      <h1>React Canvas Draw</h1>
      <button onClick={() => updateLines(-1)}>undo</button>
      <button onClick={() => updateLines(1)}>redo</button>
      <CanvasDraw onChange={lines => {
        console.log('onChange', lines);
        setLines(lines);
        setRedoLines({ lines, currentLineCount: lines.length });
      }} lines={lines} />
      <CanvasDraw lines={lines} />
    </div>
  );
};

render(<Demo />, document.querySelector("#demo"));
