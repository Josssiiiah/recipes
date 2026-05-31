import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getTabBarReserve } from '@/constants/tab-bar';

export function getKeyboardDockPaddingBottom(
  keyboardHeight: number,
  bottomInset: number,
  options?: { keyboardGap?: number; restingGap?: number },
) {
  const keyboardGap = options?.keyboardGap ?? 8;
  const restingGap = options?.restingGap ?? 12;

  if (keyboardHeight > 0) {
    const tabBarReserve = getTabBarReserve(bottomInset);
    return Math.max(keyboardGap, keyboardHeight - tabBarReserve + keyboardGap);
  }

  return Math.max(bottomInset, restingGap) + restingGap;
}

export function useKeyboardDockPadding() {
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = process.env.EXPO_OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = process.env.EXPO_OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return getKeyboardDockPaddingBottom(keyboardHeight, insets.bottom);
}
