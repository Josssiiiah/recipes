import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import Colors from '@/constants/Colors';

type LibrarySearchBarProps = {
  value: string;
  colorScheme: 'light' | 'dark';
  expandedWidth: number;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
};

const collapsedSize = 46;

export function LibrarySearchBar({
  value,
  colorScheme,
  expandedWidth,
  onChangeText,
  onSubmit,
}: LibrarySearchBarProps) {
  const colors = Colors[colorScheme];
  const canClear = value.length > 0;
  const [expanded, setExpanded] = useState(value.length > 0);
  const inputRef = useRef<TextInput>(null);
  const animatedWidth = useSharedValue(value.length > 0 ? expandedWidth : collapsedSize);
  const animatedRadius = useSharedValue(value.length > 0 ? 14 : collapsedSize / 2);
  const animatedOpacity = useSharedValue(value.length > 0 ? 1 : 0);

  useEffect(() => {
    if (value.length > 0 && !expanded) {
      setExpanded(true);
    }
  }, [expanded, value.length]);

  useEffect(() => {
    animatedWidth.value = withTiming(expanded ? expandedWidth : collapsedSize, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
    animatedRadius.value = withTiming(expanded ? 14 : collapsedSize / 2, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
    animatedOpacity.value = withTiming(expanded ? 1 : 0, {
      duration: expanded ? 140 : 90,
      easing: Easing.out(Easing.cubic),
    });
  }, [animatedOpacity, animatedRadius, animatedWidth, expanded, expandedWidth]);

  useEffect(() => {
    if (!expanded) {
      return;
    }

    const focusTimer = setTimeout(() => {
      inputRef.current?.focus();
    }, 160);

    return () => clearTimeout(focusTimer);
  }, [expanded]);

  const shellStyle = useAnimatedStyle(() => ({
    borderRadius: animatedRadius.value,
    width: animatedWidth.value,
  }));

  const inputContentStyle = useAnimatedStyle(() => ({
    opacity: animatedOpacity.value,
  }));

  function collapseIfEmpty() {
    if (value.trim().length === 0) {
      setExpanded(false);
    }
  }

  function handleAccessoryPress() {
    if (canClear) {
      onChangeText('');
      return;
    }

    Keyboard.dismiss();
    setExpanded(false);
  }

  return (
    <Animated.View
      style={[
        styles.inputShell,
        shellStyle,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
        },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Focus recipe search' : 'Search recipes'}
        hitSlop={expanded ? 8 : 10}
        onPress={() => {
          setExpanded(true);
          inputRef.current?.focus();
        }}
        style={({ pressed }) => [
          styles.searchButton,
          {
            opacity: pressed ? 0.72 : 1,
          },
        ]}>
        <SymbolView
          name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
          tintColor={expanded ? colors.muted : colors.tint}
          size={18}
        />
      </Pressable>
      <Animated.View pointerEvents={expanded ? 'auto' : 'none'} style={[styles.inputContent, inputContentStyle]}>
        <TextInput
          ref={inputRef}
          accessibilityLabel="Search recipes"
          editable={expanded}
          value={value}
          onBlur={collapseIfEmpty}
          onChangeText={onChangeText}
          placeholder="Search recipes"
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          onSubmitEditing={onSubmit}
          style={[styles.input, { color: colors.text }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={canClear ? 'Clear search' : 'Close search'}
          hitSlop={8}
          onPress={handleAccessoryPress}
          style={({ pressed }) => [
            styles.clearButton,
            {
              backgroundColor: colorScheme === 'dark' ? '#26312a' : '#e4ebe5',
              opacity: pressed ? 0.72 : 1,
            },
          ]}>
          <SymbolView
            name={{ ios: 'xmark', android: 'close', web: 'close' }}
            tintColor={colors.muted}
            size={15}
          />
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    minHeight: 22,
    paddingVertical: 0,
  },
  inputContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
  },
  inputShell: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    height: collapsedSize,
    overflow: 'hidden',
    paddingLeft: 0,
    paddingRight: 8,
    paddingVertical: 6,
  },
  searchButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    width: collapsedSize,
  },
  clearButton: {
    alignItems: 'center',
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
});
