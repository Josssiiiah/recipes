import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useLayoutEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { Recipe, RecipeIngredient, RecipeInput } from '@/types/recipe';
import { formatNumberedInstructions, parseNumberedInstructionLine } from '@/utils/format-numbered-instructions';
import { getRecipeAccent } from '@/utils/recipe-accent';
import {
  deleteRecipe,
  formatIngredient,
  getIngredientParts,
  formatRecipeDate,
  updateRecipe,
  useRecipes,
} from '@/utils/recipe-store';
import { addShoppingListItem, deleteShoppingListItem, useShoppingListItems } from '@/utils/shopping-list-store';
import { formatRecipeSourceLabel } from '@/utils/recipe-source';

type RecipeDraft = RecipeInput & {
  ingredients: RecipeIngredient[];
};

const VIEW_CONTENT_HORIZONTAL_PADDING = 18;

function recipeToDraft(recipe: Recipe): RecipeDraft {
  return {
    title: recipe.title,
    description: recipe.description,
    instructions: recipe.instructions,
    ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient })),
    ...(recipe.source ? { source: recipe.source } : {}),
  };
}

function draftsEqual(left: RecipeDraft, right: RecipeDraft) {
  return (
    left.title === right.title &&
    left.description === right.description &&
    left.instructions === right.instructions &&
    left.source === right.source &&
    left.ingredients.length === right.ingredients.length &&
    left.ingredients.every(
      (ingredient, index) =>
        ingredient.name === right.ingredients[index]?.name &&
        ingredient.amount === right.ingredients[index]?.amount,
    )
  );
}

function emptyIngredient(): RecipeIngredient {
  return { name: '', amount: '' };
}

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipeId = typeof id === 'string' ? id : '';
  const recipes = useRecipes();
  const recipe = useMemo(
    () => recipes.find((item) => item.id === recipeId),
    [recipes, recipeId],
  );
  const navigation = useNavigation();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (recipe) {
      setDraft(recipeToDraft(recipe));
      setIsEditing(false);
    }
  }, [recipe?.id, recipe?.updatedAt]);

  const savedDraft = recipe ? recipeToDraft(recipe) : null;
  const isDirty = draft != null && savedDraft != null && !draftsEqual(draft, savedDraft);

  useEffect(() => {
    if (!isEditing || !isDirty) {
      return;
    }

    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      event.preventDefault();

      Alert.alert('Discard changes?', 'You have unsaved edits to this recipe.', [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.dispatch(event.data.action),
        },
      ]);
    });

    return unsubscribe;
  }, [navigation, isEditing, isDirty]);

  function handleStartEditing() {
    if (!recipe) {
      return;
    }

    setDraft(recipeToDraft(recipe));
    setIsEditing(true);
  }

  function handleCancelEditing() {
    if (!recipe) {
      return;
    }

    if (isDirty) {
      Alert.alert('Discard changes?', 'You have unsaved edits to this recipe.', [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            setDraft(recipeToDraft(recipe));
            setIsEditing(false);
          },
        },
      ]);
      return;
    }

    setIsEditing(false);
  }

  function handleSave() {
    if (!recipe || !draft) {
      return;
    }

    if (!draft.description.trim()) {
      Alert.alert('Description required', 'Add a description before saving this recipe.');
      return;
    }

    updateRecipe(recipe.id, draft);
    setIsEditing(false);
  }

  function handleRevert() {
    if (!recipe) {
      return;
    }

    setDraft(recipeToDraft(recipe));
  }

  function confirmDelete() {
    if (!recipe) {
      return;
    }

    Alert.alert('Delete recipe?', `Remove “${recipe.title}” from your library?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteRecipe(recipe.id);
          router.back();
        },
      },
    ]);
  }

  function handleGoBack() {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    router.replace('/');
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      title: recipe && draft ? (isEditing ? draft.title.trim() || 'Recipe' : '') : 'Recipe',
      headerLeft: () => (
        <HeaderBackButton colorScheme={colorScheme} onPress={handleGoBack} />
      ),
      headerRight:
        recipe && draft
          ? () =>
              isEditing ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cancel editing"
                  onPress={handleCancelEditing}
                  style={({ pressed }) => [
                    styles.headerIconButton,
                    { opacity: pressed ? 0.65 : 1 },
                  ]}>
                  <Text style={[styles.headerActionText, { color: colors.muted }]}>Cancel</Text>
                </Pressable>
              ) : (
                <HeaderEditButton colorScheme={colorScheme} onPress={handleStartEditing} />
              )
          : undefined,
    });
  }, [navigation, recipe, draft, isEditing, colorScheme, colors.muted]);

  if (!recipeId) {
    return (
      <MissingRecipe
        colorScheme={colorScheme}
        message="This recipe link is invalid."
        onBack={() => router.back()}
      />
    );
  }

  if (!recipe || !draft) {
    return (
      <MissingRecipe
        colorScheme={colorScheme}
        message="This recipe is no longer in your library."
        onBack={() => router.back()}
      />
    );
  }

  const updatedLabel = formatRecipeDate(recipe.updatedAt);

  return (
    <>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            isEditing ? styles.contentEditing : styles.contentViewing,
            isEditing && isDirty ? styles.contentWithSaveBar : null,
          ]}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled">
          {isEditing ? (
            <>
              <Text style={[styles.meta, { color: colors.muted }]}>
                {draft.ingredients.filter((ingredient) => ingredient.name.trim()).length}{' '}
                {draft.ingredients.length === 1 ? 'ingredient' : 'ingredients'}
                {updatedLabel ? ` • Updated ${updatedLabel}` : ''}
              </Text>
              <RecipeEditor draft={draft} colorScheme={colorScheme} onChange={setDraft} />
            </>
          ) : (
            <RecipeViewer
              draft={draft}
              recipeId={recipe.id}
              colorScheme={colorScheme}
              updatedLabel={updatedLabel}
            />
          )}

          {!isEditing ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete recipe"
              onPress={confirmDelete}
              style={({ pressed }) => [
                styles.deleteButton,
                {
                  borderColor: colors.accent,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <SymbolView
                name={{ ios: 'trash', android: 'delete', web: 'delete' }}
                tintColor={colors.accent}
                size={17}
              />
              <Text style={[styles.deleteButtonText, { color: colors.accent }]}>Delete recipe</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        {isEditing && isDirty ? (
          <View
            style={[
              styles.saveBar,
              {
                backgroundColor: colors.surface,
                borderTopColor: colors.line,
              },
            ]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Discard changes"
              onPress={handleRevert}
              style={({ pressed }) => [
                styles.secondaryBarButton,
                {
                  borderColor: colors.line,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <Text style={[styles.secondaryBarButtonText, { color: colors.muted }]}>Revert</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save recipe"
              onPress={handleSave}
              style={({ pressed }) => [
                styles.primaryBarButton,
                { backgroundColor: colors.tint, opacity: pressed ? 0.75 : 1 },
              ]}>
              <Text
                style={[
                  styles.primaryBarButtonText,
                  { color: colorScheme === 'dark' ? '#102015' : '#ffffff' },
                ]}>
                Save changes
              </Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </>
  );
}

function ViewSectionHeader({
  title,
  colorScheme,
  iconName,
}: {
  title: string;
  colorScheme: 'light' | 'dark';
  iconName: ComponentProps<typeof SymbolView>['name'];
}) {
  const colors = Colors[colorScheme];

  return (
    <View style={styles.viewSectionHeader}>
      <SymbolView name={iconName} tintColor={colors.tint} size={14} />
      <Text style={[styles.viewSectionTitle, { color: colors.tint }]}>{title}</Text>
    </View>
  );
}

function RecipeViewer({
  draft,
  recipeId,
  colorScheme,
  updatedLabel,
}: {
  draft: RecipeDraft;
  recipeId: string;
  colorScheme: 'light' | 'dark';
  updatedLabel: string;
}) {
  const colors = Colors[colorScheme];
  const accent = getRecipeAccent(recipeId, colorScheme);
  const panelStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    boxShadow:
      colorScheme === 'dark' ? '0 10px 24px rgba(0,0,0,0.22)' : '0 12px 28px rgba(22,42,33,0.07)',
  };
  const shoppingListItems = useShoppingListItems();
  const shoppingListItemIdsByText = useMemo(() => {
    const map = new Map<string, string>();

    for (const item of shoppingListItems) {
      map.set(item.text.toLowerCase(), item.id);
    }

    return map;
  }, [shoppingListItems]);
  const instructionLines = draft.instructions
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const ingredients = draft.ingredients.filter((ingredient) => ingredient.name.trim());

  function handleToggleIngredientInList(ingredient: RecipeIngredient) {
    const ingredientLabel = formatIngredient(ingredient);
    const existingItemId = shoppingListItemIdsByText.get(ingredientLabel.toLowerCase());

    if (existingItemId) {
      deleteShoppingListItem(existingItemId);
      return;
    }

    addShoppingListItem(ingredientLabel);
  }

  return (
    <View style={styles.viewLayout}>
      <View
        style={[
          styles.viewHero,
          {
            backgroundColor: accent.background,
          },
        ]}>
        <View style={styles.viewHeroTitleRow}>
          <Text style={[styles.viewHeroTitle, { color: colors.text }]} numberOfLines={3}>
            {draft.title.trim() || 'Untitled recipe'}
          </Text>
        </View>
        <Text style={[styles.viewHeroDescription, { color: colors.muted }]} numberOfLines={4}>
          {draft.description.trim()}
        </Text>
        {draft.source || updatedLabel ? (
          <View style={[styles.viewHeroMeta, { borderTopColor: colors.line }]}>
            {draft.source ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Open recipe source on ${formatRecipeSourceLabel(draft.source)}`}
                onPress={() => {
                  Linking.openURL(draft.source!).catch(() => {
                    Alert.alert('Could not open link', 'This source URL could not be opened.');
                  });
                }}
                style={({ pressed }) => [styles.viewHeroSourceRow, { opacity: pressed ? 0.72 : 1 }]}>
                <SymbolView
                  name={{ ios: 'link', android: 'link', web: 'link' }}
                  tintColor={colors.tint}
                  size={14}
                />
                <Text style={[styles.viewHeroSourceText, { color: colors.tint }]} numberOfLines={1}>
                  {formatRecipeSourceLabel(draft.source)}
                </Text>
                <SymbolView
                  name={{ ios: 'arrow.up.right', android: 'open_in_new', web: 'open_in_new' }}
                  tintColor={colors.tint}
                  size={12}
                />
              </Pressable>
            ) : null}
            {updatedLabel ? (
              <Text style={[styles.viewHeroUpdated, { color: colors.muted }]} numberOfLines={1}>
                Updated {updatedLabel}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.viewBody}>
        <ViewSectionHeader
          title="Instructions"
          iconName={{
            ios: 'list.number',
            android: 'format_list_numbered',
            web: 'format_list_numbered',
          }}
          colorScheme={colorScheme}
        />
        <View style={[styles.viewPanel, panelStyle]}>
          {instructionLines.length > 0 ? (
            instructionLines.map((line, index) => {
              const step = parseNumberedInstructionLine(line);
              const stepNumber = step.number ?? index + 1;

              return (
                <View key={`instruction-${index}`} style={styles.viewStepRow}>
                  <View style={[styles.viewStepBadge, { backgroundColor: accent.background }]}>
                    <Text style={[styles.viewStepNumber, { color: colors.tint }]}>{stepNumber}</Text>
                  </View>
                  <Text selectable style={[styles.viewStepText, { color: colors.text }]}>
                    {step.text}
                  </Text>
                </View>
              );
            })
          ) : (
            <Text style={[styles.emptyIngredients, { color: colors.muted }]}>No instructions yet.</Text>
          )}
        </View>

        <ViewSectionHeader
          title="Ingredients"
          iconName={{ ios: 'leaf', android: 'eco', web: 'eco' }}
          colorScheme={colorScheme}
        />
        <View style={[styles.viewPanel, panelStyle]}>
          {ingredients.length > 0 ? (
            ingredients.map((ingredient, index) => {
              const ingredientLabel = formatIngredient(ingredient);
              const { amount, name } = getIngredientParts(ingredient);
              const isInList = shoppingListItemIdsByText.has(ingredientLabel.toLowerCase());

              return (
                <View key={`ingredient-${index}`}>
                  {index > 0 ? <View style={[styles.viewDivider, { backgroundColor: colors.line }]} /> : null}
                  <View style={styles.viewIngredientRow}>
                    <View style={[styles.viewIngredientDot, { backgroundColor: colors.tint }]} />
                    <Text selectable style={[styles.viewIngredientText, { color: colors.text }]}>
                      {amount ? (
                        <>
                          <Text style={styles.viewIngredientAmount}>{amount}</Text>
                          {' '}
                          {name}
                        </>
                      ) : (
                        name
                      )}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: isInList }}
                      accessibilityLabel={
                        isInList
                          ? `Remove ${ingredientLabel} from shopping list`
                          : `Add ${ingredientLabel} to shopping list`
                      }
                      onPress={() => handleToggleIngredientInList(ingredient)}
                      style={({ pressed }) => [
                        styles.addToListButton,
                        {
                          backgroundColor: isInList
                            ? colors.tint
                            : colorScheme === 'dark'
                              ? '#26312a'
                              : '#edf1ea',
                          opacity: pressed ? 0.72 : 1,
                        },
                      ]}>
                      <SymbolView
                        name={
                          isInList
                            ? { ios: 'checkmark', android: 'check', web: 'check' }
                            : { ios: 'plus', android: 'add', web: 'add' }
                        }
                        tintColor={
                          isInList ? (colorScheme === 'dark' ? '#102015' : '#ffffff') : colors.tint
                        }
                        size={16}
                      />
                    </Pressable>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={[styles.emptyIngredients, { color: colors.muted }]}>No ingredients yet.</Text>
          )}
        </View>
      </View>
    </View>
  );
}

function RecipeEditor({
  draft,
  colorScheme,
  onChange,
}: {
  draft: RecipeDraft;
  colorScheme: 'light' | 'dark';
  onChange: (draft: RecipeDraft) => void;
}) {
  const colors = Colors[colorScheme];
  const inputShell = {
    backgroundColor: colors.surface,
    borderColor: colors.line,
  };

  function updateDraft(patch: Partial<RecipeDraft>) {
    onChange({ ...draft, ...patch });
  }

  function updateIngredient(index: number, patch: Partial<RecipeIngredient>) {
    onChange({
      ...draft,
      ingredients: draft.ingredients.map((ingredient, ingredientIndex) =>
        ingredientIndex === index ? { ...ingredient, ...patch } : ingredient,
      ),
    });
  }

  function addIngredient() {
    onChange({
      ...draft,
      ingredients: [...draft.ingredients, emptyIngredient()],
    });
  }

  function removeIngredient(index: number) {
    onChange({
      ...draft,
      ingredients: draft.ingredients.filter((_, ingredientIndex) => ingredientIndex !== index),
    });
  }

  return (
    <View style={styles.section}>
      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: colors.muted }]}>Title</Text>
        <View style={[styles.inputShell, inputShell]}>
          <TextInput
            accessibilityLabel="Recipe title"
            value={draft.title}
            onChangeText={(title) => updateDraft({ title })}
            placeholder="Recipe title"
            placeholderTextColor={colors.muted}
            style={[styles.singleLineInput, { color: colors.text }]}
          />
        </View>
      </View>

      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: colors.muted }]}>Description</Text>
        <View style={[styles.inputShell, inputShell, styles.multilineShell]}>
          <TextInput
            accessibilityLabel="Recipe description"
            value={draft.description}
            onChangeText={(description) => updateDraft({ description })}
            multiline
            placeholder="A bright, simple pasta with lemon, basil, and parmesan."
            placeholderTextColor={colors.muted}
            textAlignVertical="top"
            style={[styles.descriptionInput, { color: colors.text }]}
          />
        </View>
      </View>

      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: colors.muted }]}>Instructions</Text>
        <View style={[styles.inputShell, inputShell, styles.multilineShell]}>
          <TextInput
            accessibilityLabel="Recipe instructions"
            value={draft.instructions}
            onChangeText={(instructions) => updateDraft({ instructions })}
            onBlur={() => {
              const formatted = formatNumberedInstructions(draft.instructions);
              if (formatted !== draft.instructions) {
                updateDraft({ instructions: formatted });
              }
            }}
            multiline
            placeholder={'1. Boil the pasta.\n2. Toss with sauce and serve.'}
            placeholderTextColor={colors.muted}
            textAlignVertical="top"
            style={[styles.multilineInput, { color: colors.text }]}
          />
        </View>
      </View>

      <View style={styles.field}>
        <View style={styles.ingredientsHeader}>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>Ingredients</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add ingredient"
            onPress={addIngredient}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[styles.addIngredientText, { color: colors.tint }]}>Add</Text>
          </Pressable>
        </View>

        <View style={styles.editorIngredientList}>
          {draft.ingredients.map((ingredient, index) => (
            <View key={`ingredient-${index}`} style={[styles.editorIngredientCard, inputShell]}>
              <View style={styles.editorIngredientInputs}>
                <TextInput
                  accessibilityLabel={`Ingredient ${index + 1} name`}
                  value={ingredient.name}
                  onChangeText={(name) => updateIngredient(index, { name })}
                  placeholder="Ingredient"
                  placeholderTextColor={colors.muted}
                  style={[styles.ingredientNameInput, { color: colors.text }]}
                />
                <TextInput
                  accessibilityLabel={`Ingredient ${index + 1} amount`}
                  value={ingredient.amount}
                  onChangeText={(amount) => updateIngredient(index, { amount })}
                  placeholder="Amt"
                  placeholderTextColor={colors.muted}
                  selectTextOnFocus
                  style={[styles.ingredientAmountInput, { color: colors.text, borderColor: colors.line }]}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ingredient ${index + 1}`}
                onPress={() => removeIngredient(index)}
                style={({ pressed }) => [
                  styles.removeIngredientButton,
                  {
                    backgroundColor: colorScheme === 'dark' ? '#26312a' : '#edf1ea',
                    opacity: pressed ? 0.65 : 1,
                  },
                ]}>
                <SymbolView
                  name={{ ios: 'minus.circle.fill', android: 'remove_circle', web: 'remove_circle' }}
                  tintColor={colors.accent}
                  size={20}
                />
              </Pressable>
            </View>
          ))}
          {draft.ingredients.length === 0 ? (
            <Text style={[styles.emptyIngredients, { color: colors.muted }]}>
              Add at least one ingredient.
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function HeaderChipButton({
  accessibilityLabel,
  colorScheme,
  onPress,
  children,
}: {
  accessibilityLabel: string;
  colorScheme: 'light' | 'dark';
  onPress: () => void;
  children: ReactNode;
}) {
  const colors = Colors[colorScheme];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerIconButton,
        { opacity: pressed ? 0.72 : 1 },
      ]}>
      <View
        style={[
          styles.headerChipButton,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
          },
        ]}>
        {children}
      </View>
    </Pressable>
  );
}

function HeaderBackButton({
  colorScheme,
  onPress,
}: {
  colorScheme: 'light' | 'dark';
  onPress: () => void;
}) {
  const colors = Colors[colorScheme];

  return (
    <HeaderChipButton accessibilityLabel="Back to library" colorScheme={colorScheme} onPress={onPress}>
      <SymbolView
        name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
        tintColor={colors.text}
        size={18}
        weight="semibold"
      />
    </HeaderChipButton>
  );
}

function HeaderEditButton({
  colorScheme,
  onPress,
}: {
  colorScheme: 'light' | 'dark';
  onPress: () => void;
}) {
  const colors = Colors[colorScheme];

  return (
    <HeaderChipButton accessibilityLabel="Edit recipe" colorScheme={colorScheme} onPress={onPress}>
      <SymbolView
        name={{ ios: 'square.and.pencil', android: 'edit', web: 'edit' }}
        tintColor={colors.tint}
        size={20}
        weight="medium"
      />
    </HeaderChipButton>
  );
}

function MissingRecipe({
  colorScheme,
  message,
  onBack,
}: {
  colorScheme: 'light' | 'dark';
  message: string;
  onBack: () => void;
}) {
  const colors = Colors[colorScheme];

  return (
    <View style={[styles.screen, styles.missingState, { backgroundColor: colors.background }]}>
      <Text selectable style={[styles.missingTitle, { color: colors.text }]}>
        Recipe not found
      </Text>
      <Text selectable style={[styles.missingCopy, { color: colors.muted }]}>
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [
          styles.backButton,
          { backgroundColor: colors.tint, opacity: pressed ? 0.75 : 1 },
        ]}>
        <Text style={[styles.backButtonText, { color: colorScheme === 'dark' ? '#102015' : '#ffffff' }]}>
          Back to library
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  addIngredientText: {
    fontSize: 15,
    fontWeight: '800',
  },
  addToListButton: {
    alignItems: 'center',
    borderRadius: 8,
    flexShrink: 0,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  backButton: {
    borderRadius: 8,
    marginTop: 8,
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  content: {
    gap: 18,
    paddingBottom: 40,
    paddingTop: 0,
  },
  contentEditing: {
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  contentViewing: {
    paddingHorizontal: 0,
  },
  contentWithSaveBar: {
    paddingBottom: 120,
  },
  deleteButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: VIEW_CONTENT_HORIZONTAL_PADDING,
    marginTop: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '800',
  },
  descriptionInput: {
    fontSize: 16,
    lineHeight: 23,
    minHeight: 76,
  },
  editorIngredientCard: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  editorIngredientInputs: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
  },
  editorIngredientList: {
    gap: 10,
  },
  emptyIngredients: {
    fontSize: 15,
    lineHeight: 22,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  headerActionText: {
    fontSize: 16,
    fontWeight: '800',
  },
  headerChipButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  headerIconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    minHeight: 44,
    minWidth: 44,
  },
  ingredientsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  ingredientAmountInput: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    lineHeight: 20,
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: 'right',
    width: 96,
  },
  ingredientNameInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    minWidth: 0,
  },
  inputShell: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  meta: {
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  missingCopy: {
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 320,
    textAlign: 'center',
  },
  missingState: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  missingTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  multilineInput: {
    fontSize: 16,
    lineHeight: 24,
    minHeight: 120,
  },
  multilineShell: {
    alignItems: 'stretch',
  },
  primaryBarButton: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryBarButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
  removeIngredientButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  saveBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    left: 0,
    padding: 12,
    position: 'absolute',
    right: 0,
  },
  screen: {
    flex: 1,
  },
  secondaryBarButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 108,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryBarButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
  section: {
    gap: 14,
  },
  singleLineInput: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
  },
  viewBody: {
    gap: 14,
    paddingHorizontal: VIEW_CONTENT_HORIZONTAL_PADDING,
    paddingTop: 12,
  },
  viewDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },
  viewHero: {
    alignItems: 'stretch',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    gap: 0,
    overflow: 'hidden',
    paddingBottom: 12,
    paddingHorizontal: 24,
    paddingTop: 14,
  },
  viewHeroMeta: {
    alignSelf: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
  },
  viewHeroSourceRow: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    maxWidth: '100%',
  },
  viewHeroSourceText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  viewHeroDescription: {
    alignSelf: 'center',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    marginTop: 8,
    maxWidth: 520,
    opacity: 0.82,
    textAlign: 'center',
  },
  viewHeroUpdated: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
    lineHeight: 16,
    opacity: 0.72,
    textAlign: 'center',
  },
  viewHeroTitle: {
    alignSelf: 'stretch',
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
    textAlign: 'center',
    transform: [{ translateX: 0.33 }],
  },
  viewHeroTitleRow: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  viewIngredientDot: {
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  viewIngredientRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 7,
  },
  viewIngredientAmount: {
    fontWeight: '700',
  },
  viewIngredientText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
  },
  viewLayout: {
    gap: 0,
  },
  viewPanel: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  viewSectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginBottom: -4,
  },
  viewSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  viewStepBadge: {
    alignItems: 'center',
    borderRadius: 8,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  viewStepNumber: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  viewStepRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  viewStepText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    paddingTop: 1,
  },
});
