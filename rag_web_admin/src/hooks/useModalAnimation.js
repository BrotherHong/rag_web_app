/**
 * useModalAnimation - 對話框動畫 Hook
 * 處理對話框的打開和關閉動畫
 */

import { useState, useEffect } from 'react';

export function useModalAnimation(isOpen, onClose, duration = 200) {
  const [isClosing, setIsClosing] = useState(false);
  const [shouldRender, setShouldRender] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setShouldRender(false);
      onClose();
    }, duration);
  };

  const animationClass = isClosing ? 'animate-fadeOut' : 'animate-fadeIn';
  const contentAnimationClass = isClosing ? 'animate-scaleOut' : 'animate-scaleIn';

  return {
    shouldRender,
    isClosing,
    handleClose,
    animationClass,
    contentAnimationClass
  };
}
