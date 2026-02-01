import React, { useState, useEffect } from 'react';

interface LoadingScreenProps {
  status: 'booting' | 'authorizing' | 'login' | 'idle';
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ status }) => {
  const [dots, setDots] = useState('.');
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots(prev => {
        if (prev === '.') return '..';
        if (prev === '..') return '...';
        return '.';
      });
    }, 400);

    return () => clearInterval(dotsInterval);
  }, []);

  useEffect(() => {
    const cursorInterval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 530);

    return () => clearInterval(cursorInterval);
  }, []);

  const getMessage = () => {
    switch (status) {
      case 'login':
        return `login${dots}`;
      case 'authorizing':
        return `authorizing${dots}`;
      case 'booting':
        return `booting${dots}`;
      default:
        return `loading${dots}`;
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-[#0d1117]">
      <div className="font-mono text-green-400 text-2xl tracking-wider">
        <span className="text-gray-500">&gt; </span>
        <span>{getMessage()}</span>
        <span className={`ml-1 ${showCursor ? 'opacity-100' : 'opacity-0'}`}>▋</span>
      </div>
    </div>
  );
};
