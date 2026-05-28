import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import type { Recipe } from '@/types/recipe';
import { getRecipeAccent } from '@/utils/recipe-accent';

type RecipeCardProps = {
  recipe: Recipe;
  colorScheme: 'light' | 'dark';
  onDelete: (id: string) => void;
  onPress?: () => void;
  variant?: 'grid' | 'list';
  gridColumns?: 1 | 2;
};

export function RecipeCard({
  recipe,
  colorScheme,
  onDelete,
  onPress,
  variant = 'grid',
  gridColumns = 1,
}: RecipeCardProps) {
  const colors = Colors[colorScheme];

  const cardShadow =
    colorScheme === 'dark' ? '0 12px 28px rgba(0,0,0,0.28)' : '0 14px 32px rgba(22,42,33,0.1)';

  const cardStyle = [
    variant === 'list' ? styles.listCard : styles.card,
    {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      boxShadow: cardShadow,
    },
  ];

  if (variant === 'list') {
    return (
      <View style={cardStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${recipe.title}`}
          disabled={!onPress}
          onPress={onPress}
          style={({ pressed }) => [styles.listBody, onPress ? { opacity: pressed ? 0.82 : 1 } : null]}>
          <Text selectable style={[styles.listTitle, { color: colors.text }]} numberOfLines={1}>
            {recipe.title}
          </Text>
          <Text selectable style={[styles.listDescription, { color: colors.muted }]} numberOfLines={2}>
            {recipe.description}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`Delete ${recipe.title}`}
          onPress={() => onDelete(recipe.id)}
          style={({ pressed }) => [
            styles.iconButton,
            {
              backgroundColor: colorScheme === 'dark' ? '#26312a' : '#edf1ea',
              opacity: pressed ? 0.65 : 1,
            },
          ]}>
          <SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} tintColor={colors.accent} size={17} />
        </Pressable>
      </View>
    );
  }

  const accent = getRecipeAccent(recipe.id, colorScheme);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${recipe.title}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [cardStyle, onPress ? { opacity: pressed ? 0.94 : 1 } : null]}>
      <View style={[styles.hero, { backgroundColor: accent.background }]}>
        <View pointerEvents="none" style={styles.heroIconWrap}>
          <SymbolView
            name={{ ios: 'fork.knife', android: 'restaurant', web: 'restaurant' }}
            tintColor={accent.icon}
            size={gridColumns === 1 ? 40 : 34}
          />
        </View>
        <Pressable
          accessibilityLabel={`Delete ${recipe.title}`}
          hitSlop={8}
          onPress={() => onDelete(recipe.id)}
          style={({ pressed }) => [
            styles.heroDeleteButton,
            {
              backgroundColor: colorScheme === 'dark' ? 'rgba(17,21,19,0.72)' : 'rgba(255,255,255,0.88)',
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} tintColor={colors.accent} size={15} />
        </Pressable>
      </View>

      <View style={styles.cardBody}>
        <Text selectable style={[styles.gridTitle, { color: colors.text }]}>
          {recipe.title}
        </Text>
        <Text selectable style={[styles.gridDescription, { color: colors.muted }]} numberOfLines={3}>
          {recipe.description}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listBody: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  listCard: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
  },
  listDescription: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 19,
  },
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    width: '100%',
  },
  hero: {
    alignItems: 'flex-end',
    height: 52,
    justifyContent: 'flex-start',
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  heroDeleteButton: {
    alignItems: 'center',
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    width: 30,
    zIndex: 1,
  },
  heroIconWrap: {
    bottom: -4,
    left: 16,
    opacity: 0.38,
    position: 'absolute',
  },
  cardBody: {
    minWidth: 0,
    paddingBottom: 16,
    paddingHorizontal: 18,
    paddingTop: 16,
    gap: 8,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  gridTitle: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  gridDescription: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 19,
  },
});
