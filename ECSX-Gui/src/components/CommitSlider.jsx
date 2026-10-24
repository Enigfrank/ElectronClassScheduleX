import React, { useEffect, useRef, useState } from 'react';
import { Slider, SliderFilledTrack, SliderThumb, SliderTrack } from '@chakra-ui/react';

/**
 * 拖动时保留本地草稿，仅在操作结束且数值改变时提交。
 * @param {{ariaLabel: string, value: number, min: number, max: number, step?: number, onCommit: Function, isDisabled?: boolean}} props 滑块属性
 * @returns {React.ReactElement} 延迟提交滑块
 */
export default function CommitSlider({ ariaLabel, value, min, max, step = 1, onCommit, isDisabled = false }) {
  const [draft, setDraft] = useState(value);
  const lastCommitted = useRef(value);

  useEffect(() => {
    setDraft(value);
    lastCommitted.current = value;
  }, [value]);

  /** 松手或键盘操作结束后提交一次，避免重复结束事件触发保存。 */
  function handleCommit(nextValue) {
    if (isDisabled) return;
    setDraft(nextValue);
    if (nextValue === lastCommitted.current) return;
    lastCommitted.current = nextValue;
    onCommit(nextValue);
  }

  return (
    <Slider aria-label={ariaLabel} value={draft} min={min} max={max} step={step}
      isDisabled={isDisabled} onChange={setDraft} onChangeEnd={handleCommit} colorScheme="blue">
      <SliderTrack><SliderFilledTrack /></SliderTrack>
      <SliderThumb />
    </Slider>
  );
}
