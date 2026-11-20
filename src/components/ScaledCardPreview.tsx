import React, { useEffect, useRef, useState } from 'react';
import { CardTemplateSettings, ExamQuestion } from '../types/exam';
import { QuestionCardCanvas } from './QuestionCardCanvas';

interface ScaledCardPreviewProps {
  question: ExamQuestion;
  settings: CardTemplateSettings;
  forceShowSolution?: boolean;
  className?: string;
}

const NATIVE_WIDTH = 1600;

export const ScaledCardPreview: React.FC<ScaledCardPreviewProps> = ({
  question,
  settings,
  forceShowSolution,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [nativeHeight, setNativeHeight] = useState(900);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateScale = () => {
      const width = container.clientWidth;
      if (width > 0) {
        setScale(Math.min(1, width / NATIVE_WIDTH));
      }
    };

    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    const updateHeight = () => {
      const h = inner.offsetHeight;
      if (h > 0) setNativeHeight(h);
    };

    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [question, settings, forceShowSolution]);

  const scaledHeight = Math.ceil(nativeHeight * scale);

  return (
    <div
      ref={containerRef}
      className={`w-full relative overflow-hidden ${className}`}
      style={{ height: `${scaledHeight}px` }}
    >
      <div
        ref={innerRef}
        style={{
          width: `${NATIVE_WIDTH}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <QuestionCardCanvas
          question={question}
          settings={settings}
          forceShowSolution={forceShowSolution}
        />
      </div>
    </div>
  );
};
