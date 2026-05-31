import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import Colors from '@/constants/Colors';

type LibrarySearchBarProps = {
  value: string;
  colorScheme: 'light' | 'dark';
  onChangeText: (value: string) => void;
  onSubmit: () => void;
};

export function LibrarySearchBar({ value, colorScheme, onChangeText, onSubmit }: LibrarySearchBarProps) {
  const colors = Colors[colorScheme];
  const canClear = value.length > 0;

  return (
    <View
      style={[
        styles.inputShell,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
        },
      ]}>
      <SymbolView
        name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
        tintColor={colors.muted}
        size={17}
      />
      <TextInput
        accessibilityLabel="Search recipes"
        value={value}
        onChangeText={onChangeText}
        placeholder="Search recipes"
        placeholderTextColor={colors.muted}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        style={[styles.input, { color: colors.text }]}
      />
      {canClear ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}
          onPress={() => onChangeText('')}
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
      ) : null}
    </View>
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
  inputShell: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  clearButton: {
    alignItems: 'center',
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
});
