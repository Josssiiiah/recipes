import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import Colors from '@/constants/Colors';

type LibrarySearchBarProps = {
  value: string;
  colorScheme: 'light' | 'dark';
  onChangeText: (value: string) => void;
  onSearch: () => void;
};

export function LibrarySearchBar({ value, colorScheme, onChangeText, onSearch }: LibrarySearchBarProps) {
  const colors = Colors[colorScheme];
  const canSearch = value.trim().length > 0;

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
        placeholder="Search recipes or ingredients"
        placeholderTextColor={colors.muted}
        returnKeyType="search"
        onSubmitEditing={onSearch}
        style={[styles.input, { color: colors.text }]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search library"
        disabled={!canSearch}
        onPress={onSearch}
        style={({ pressed }) => [
          styles.submitButton,
          {
            backgroundColor: canSearch ? colors.tint : colorScheme === 'dark' ? '#26312a' : '#e4ebe5',
            opacity: pressed && canSearch ? 0.75 : 1,
          },
        ]}>
        <SymbolView
          name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }}
          tintColor={canSearch ? (colorScheme === 'dark' ? '#102015' : '#ffffff') : colors.muted}
          size={18}
        />
      </Pressable>
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
  submitButton: {
    alignItems: 'center',
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
});
