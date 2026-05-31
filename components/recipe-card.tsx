import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import type { Recipe } from '@/types/recipe';
import { getRecipeAccent } from '@/utils/recipe-accent';

type RecipeCardProps = {
  recipe: Recipe;
  colorScheme: 'light' | 'dark';
  onPress?: () => void;
  onRetryImage?: (recipe: Recipe) => void;
  variant?: 'grid' | 'list';
  gridColumns?: 1 | 2;
};

export function RecipeCard({
  recipe,
  colorScheme,
  onPress,
  onRetryImage,
  variant = 'grid',
  gridColumns = 1,
}: RecipeCardProps) {
  const colors = Colors[colorScheme];
  const imageFailed = recipe.imageStatus === 'failed' && !recipe.imageUri;

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
          <RecipeCardImage
            recipe={recipe}
            colorScheme={colorScheme}
            size="list"
            accentColor={getRecipeAccent(recipe.id, colorScheme).icon}
          />
          <View style={styles.listTextBlock}>
            <Text selectable style={[styles.listTitle, { color: colors.text }]} numberOfLines={1}>
              {recipe.title}
            </Text>
            <Text selectable style={[styles.listDescription, { color: colors.muted }]} numberOfLines={2}>
              {recipe.description}
            </Text>
          </View>
        </Pressable>
        {imageFailed && onRetryImage ? (
          <RecipeImageRetryButton
            colorScheme={colorScheme}
            label="Retry"
            onPress={() => onRetryImage(recipe)}
          />
        ) : null}
      </View>
    );
  }

  const accent = getRecipeAccent(recipe.id, colorScheme);

  return (
    <View style={cardStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${recipe.title}`}
        disabled={!onPress}
        onPress={onPress}
        style={({ pressed }) => [
          styles.gridOpenArea,
          onPress ? { opacity: pressed ? 0.94 : 1 } : null,
        ]}>
        <View style={[styles.hero, { backgroundColor: accent.background }]}>
          <RecipeCardImage
            recipe={recipe}
            colorScheme={colorScheme}
            size="grid"
            accentColor={accent.icon}
            gridColumns={gridColumns}
          />
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
      {imageFailed && onRetryImage ? (
        <View style={styles.gridRetryAnchor}>
          <RecipeImageRetryButton
            colorScheme={colorScheme}
            label="Retry"
            onPress={() => onRetryImage(recipe)}
          />
        </View>
      ) : null}
    </View>
  );
}

function RecipeImageRetryButton({
  colorScheme,
  label,
  onPress,
}: {
  colorScheme: 'light' | 'dark';
  label: string;
  onPress: () => void;
}) {
  const colors = Colors[colorScheme];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Retry recipe image"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.retryButton,
        {
          backgroundColor: colorScheme === 'dark' ? '#1b241f' : '#ffffff',
          borderColor: colors.line,
          opacity: pressed ? 0.72 : 1,
        },
      ]}>
      <SymbolView
        name={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }}
        tintColor={colors.tint}
        size={13}
      />
      <Text style={[styles.retryButtonText, { color: colors.tint }]}>{label}</Text>
    </Pressable>
  );
}

function RecipeCardImage({
  recipe,
  colorScheme,
  size,
  accentColor,
  gridColumns = 1,
}: {
  recipe: Recipe;
  colorScheme: 'light' | 'dark';
  size: 'grid' | 'list';
  accentColor: string;
  gridColumns?: 1 | 2;
}) {
  const colors = Colors[colorScheme];

  if (recipe.imageUri) {
    return (
      <Image
        accessibilityLabel={`${recipe.title} recipe image`}
        cachePolicy="memory-disk"
        contentFit="cover"
        source={recipe.imageUri}
        style={size === 'list' ? styles.listImage : styles.gridImage}
        transition={320}
      />
    );
  }

  if (recipe.imageStatus === 'pending') {
    return (
      <View style={size === 'list' ? styles.listImagePlaceholder : styles.gridImagePlaceholder}>
        <ActivityIndicator color={accentColor} size="small" />
      </View>
    );
  }

  return (
    <View style={size === 'list' ? styles.listImagePlaceholder : styles.gridImagePlaceholder}>
      <SymbolView
        name={{ ios: 'fork.knife', android: 'restaurant', web: 'restaurant' }}
        tintColor={accentColor}
        size={size === 'grid' ? (gridColumns === 1 ? 40 : 34) : 18}
      />
      {size === 'list' && recipe.imageStatus === 'failed' ? (
        <View style={[styles.listImageErrorDot, { backgroundColor: colors.accent }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gridImage: {
    height: '100%',
    width: '100%',
  },
  gridImagePlaceholder: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    opacity: 0.42,
    width: '100%',
  },
  gridOpenArea: {
    width: '100%',
  },
  listBody: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 12,
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
  listImage: {
    borderRadius: 8,
    flexShrink: 0,
    height: 48,
    width: 56,
  },
  listImageErrorDot: {
    borderRadius: 999,
    height: 6,
    position: 'absolute',
    right: 5,
    top: 5,
    width: 6,
  },
  listImagePlaceholder: {
    alignItems: 'center',
    borderRadius: 8,
    flexShrink: 0,
    height: 48,
    justifyContent: 'center',
    opacity: 0.58,
    overflow: 'hidden',
    position: 'relative',
    width: 56,
  },
  listTextBlock: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  gridRetryAnchor: {
    position: 'absolute',
    right: 10,
    top: 10,
  },
  hero: {
    height: 108,
    overflow: 'hidden',
  },
  cardBody: {
    minWidth: 0,
    paddingBottom: 16,
    paddingHorizontal: 18,
    paddingTop: 16,
    gap: 8,
  },
  gridTitle: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 22,
  },
  gridDescription: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 19,
  },
  retryButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 4,
    minHeight: 30,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  retryButtonText: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 14,
  },
});
