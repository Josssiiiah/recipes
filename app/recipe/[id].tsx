import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useEffect, useLayoutEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
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
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { Recipe, RecipeIngredient, RecipeInput } from '@/types/recipe';
import { formatNumberedInstructions, parseNumberedInstructionLine } from '@/utils/format-numbered-instructions';
import {
  deleteRecipe,
  formatIngredient,
  getIngredientParts,
  formatRecipeDate,
  updateRecipe,
  updateRecipeNotes,
  useRecipes,
} from '@/utils/recipe-store';
import { generateAndStoreRecipeImage } from '@/utils/recipe-image-jobs';
import { addShoppingListItem, deleteShoppingListItem, useShoppingListItems } from '@/utils/shopping-list-store';
import { formatRecipeSourceLabel, normalizeRecipeSource } from '@/utils/recipe-source';

const VIEW_CONTENT_HORIZONTAL_PADDING = 18;

type EditableField = 'title' | 'description' | 'source' | 'notes' | 'instructions' | 'ingredients';

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

  useEffect(() => {
    if (!recipe || recipe.imageStatus !== 'pending') {
      return;
    }

    generateAndStoreRecipeImage(recipe);
  }, [recipe?.id, recipe?.imageStatus]);

  async function handleSaveRecipe(patch: Partial<RecipeInput>) {
    if (!recipe) {
      return false;
    }

    const input: RecipeInput = {
      title: recipe.title,
      description: recipe.description,
      instructions: recipe.instructions,
      ingredients: recipe.ingredients,
      ...(recipe.notes !== undefined ? { notes: recipe.notes } : {}),
      ...(recipe.source !== undefined ? { source: recipe.source } : {}),
      ...patch,
    };

    const updated = await updateRecipe(recipe.id, input);

    if (!updated) {
      Alert.alert('Changes not saved', 'Could not save your changes. Try again.');
      return false;
    }

    return true;
  }

  async function handleSaveNotes(notes: string) {
    if (!recipe) {
      return false;
    }

    try {
      const updated = await updateRecipeNotes(recipe.id, notes);
      if (!updated) {
        Alert.alert('Notes not saved', 'This recipe is no longer in your library.');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Failed to save recipe notes.', {
        recipeId: recipe.id,
        message: error instanceof Error ? error.message : String(error),
      });
      Alert.alert('Notes not saved', 'Could not save your notes. Try again.');
      return false;
    }
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
          void deleteRecipe(recipe.id);
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
      title: '',
      headerLeft: () => (
        <HeaderBackButton colorScheme={colorScheme} onPress={handleGoBack} />
      ),
      headerRight: recipe
        ? () => <HeaderDeleteButton colorScheme={colorScheme} onPress={confirmDelete} />
        : undefined,
    });
  }, [navigation, recipe, colorScheme]);

  if (!recipeId) {
    return (
      <MissingRecipe
        colorScheme={colorScheme}
        message="This recipe link is invalid."
        onBack={() => router.back()}
      />
    );
  }

  if (!recipe) {
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, styles.contentViewing]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled">
        <RecipeViewer
          recipe={recipe}
          colorScheme={colorScheme}
          updatedLabel={updatedLabel}
          onRetryImage={() => {
            void generateAndStoreRecipeImage(recipe, { markPending: true });
          }}
          onSaveNotes={handleSaveNotes}
          onSaveRecipe={handleSaveRecipe}
        />
      </ScrollView>
    </KeyboardAvoidingView>
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
  recipe,
  colorScheme,
  updatedLabel,
  onRetryImage,
  onSaveNotes,
  onSaveRecipe,
}: {
  recipe: Recipe;
  colorScheme: 'light' | 'dark';
  updatedLabel: string;
  onRetryImage: () => void;
  onSaveNotes: (notes: string) => boolean | Promise<boolean>;
  onSaveRecipe: (patch: Partial<RecipeInput>) => boolean | Promise<boolean>;
}) {
  const colors = Colors[colorScheme];
  const panelStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    boxShadow:
      colorScheme === 'dark' ? '0 10px 24px rgba(0,0,0,0.22)' : '0 12px 28px rgba(22,42,33,0.07)',
  };
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const stopEditing = () => setEditingField(null);

  return (
    <View style={styles.viewLayout}>
      <View style={[styles.viewHero, { backgroundColor: colors.background }]}>
        <RecipeHeroImage recipe={recipe} colorScheme={colorScheme} onRetry={onRetryImage} />
        <EditableHeroTitle
          colorScheme={colorScheme}
          title={recipe.title}
          isEditing={editingField === 'title'}
          onStartEditing={() => setEditingField('title')}
          onStopEditing={stopEditing}
          onSave={(title) => onSaveRecipe({ title })}
        />
        <EditableHeroDescription
          colorScheme={colorScheme}
          description={recipe.description}
          isEditing={editingField === 'description'}
          onStartEditing={() => setEditingField('description')}
          onStopEditing={stopEditing}
          onSave={(description) => onSaveRecipe({ description })}
        />
        <View style={[styles.viewHeroMeta, { borderTopColor: colors.line }]}>
          <EditableHeroSource
            colorScheme={colorScheme}
            source={recipe.source}
            isEditing={editingField === 'source'}
            onStartEditing={() => setEditingField('source')}
            onStopEditing={stopEditing}
            onSave={(source) => onSaveRecipe({ source })}
          />
          {updatedLabel ? (
            <Text style={[styles.viewHeroUpdated, { color: colors.muted }]} numberOfLines={1}>
              Updated {updatedLabel}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.viewBody}>
        <RecipeNotesSection
          colorScheme={colorScheme}
          notes={recipe.notes ?? ''}
          panelStyle={panelStyle}
          isEditing={editingField === 'notes'}
          onStartEditing={() => setEditingField('notes')}
          onStopEditing={stopEditing}
          onSave={onSaveNotes}
        />

        <ViewSectionHeader
          title="Instructions"
          iconName={{
            ios: 'list.number',
            android: 'format_list_numbered',
            web: 'format_list_numbered',
          }}
          colorScheme={colorScheme}
        />
        <EditableInstructionsPanel
          colorScheme={colorScheme}
          instructions={recipe.instructions}
          panelStyle={panelStyle}
          isEditing={editingField === 'instructions'}
          onStartEditing={() => setEditingField('instructions')}
          onStopEditing={stopEditing}
          onSave={(instructions) => onSaveRecipe({ instructions })}
        />

        <ViewSectionHeader
          title="Ingredients"
          iconName={{ ios: 'leaf', android: 'eco', web: 'eco' }}
          colorScheme={colorScheme}
        />
        <EditableIngredientsPanel
          colorScheme={colorScheme}
          ingredients={recipe.ingredients}
          panelStyle={panelStyle}
          isEditing={editingField === 'ingredients'}
          onStartEditing={() => setEditingField('ingredients')}
          onStopEditing={stopEditing}
          onSave={(ingredients) => onSaveRecipe({ ingredients })}
        />
      </View>
    </View>
  );
}

function RecipeHeroImage({
  recipe,
  colorScheme,
  onRetry,
}: {
  recipe: Recipe;
  colorScheme: 'light' | 'dark';
  onRetry: () => void;
}) {
  const colors = Colors[colorScheme];
  const placeholderBackground = colorScheme === 'dark' ? '#26312a' : '#edf1ea';

  if (recipe.imageUri) {
    return (
      <View style={styles.recipeHeroImageFrame}>
        <Image
          accessibilityLabel={`${recipe.title} recipe image`}
          cachePolicy="memory-disk"
          contentFit="cover"
          source={recipe.imageUri}
          style={styles.recipeHeroImage}
          transition={420}
        />
      </View>
    );
  }

  if (recipe.imageStatus === 'pending') {
    return (
      <View style={[styles.recipeHeroImagePlaceholder, { backgroundColor: placeholderBackground }]}>
        <ActivityIndicator color={colors.tint} size="small" />
        <Text style={[styles.recipeHeroImageStateText, { color: colors.muted }]}>
          Creating image
        </Text>
      </View>
    );
  }

  if (recipe.imageStatus === 'failed') {
    return (
      <View style={[styles.recipeHeroImagePlaceholder, { backgroundColor: placeholderBackground }]}>
        <SymbolView
          name={{ ios: 'photo.badge.exclamationmark', android: 'broken_image', web: 'broken_image' }}
          tintColor={colors.tint}
          size={22}
        />
        <Text style={[styles.recipeHeroImageStateText, { color: colors.muted }]}>
          Image not created
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry recipe image"
          onPress={onRetry}
          style={({ pressed }) => [
            styles.recipeHeroImageRetryButton,
            {
              borderColor: colors.line,
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <SymbolView
            name={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }}
            tintColor={colors.tint}
            size={14}
          />
          <Text style={[styles.recipeHeroImageRetryText, { color: colors.tint }]}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return null;
}

function InlineEditActions({
  colorScheme,
  onCancel,
  onSave,
  center,
  saveDisabled,
}: {
  colorScheme: 'light' | 'dark';
  onCancel: () => void;
  onSave: () => void;
  center?: boolean;
  saveDisabled?: boolean;
}) {
  const colors = Colors[colorScheme];

  return (
    <View style={[styles.inlineActions, center ? styles.inlineActionsCenter : null]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel edit"
        onPress={onCancel}
        style={({ pressed }) => [
          styles.inlineButton,
          {
            borderColor: colors.line,
            opacity: pressed ? 0.7 : 1,
          },
        ]}>
        <Text style={[styles.inlineButtonText, { color: colors.muted }]}>Cancel</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save changes"
        accessibilityState={{ disabled: Boolean(saveDisabled) }}
        disabled={saveDisabled}
        onPress={onSave}
        style={({ pressed }) => [
          styles.inlineButton,
          {
            backgroundColor: colors.tint,
            borderColor: colors.tint,
            opacity: saveDisabled ? 0.5 : pressed ? 0.75 : 1,
          },
        ]}>
        <Text
          style={[
            styles.inlineButtonText,
            { color: colorScheme === 'dark' ? '#102015' : '#ffffff' },
          ]}>
          Save
        </Text>
      </Pressable>
    </View>
  );
}

function EditableHeroTitle({
  colorScheme,
  title,
  isEditing,
  onStartEditing,
  onStopEditing,
  onSave,
}: {
  colorScheme: 'light' | 'dark';
  title: string;
  isEditing: boolean;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onSave: (title: string) => boolean | Promise<boolean>;
}) {
  const colors = Colors[colorScheme];
  const [value, setValue] = useState(title);

  async function handleSave() {
    const trimmed = value.trim();
    if (!trimmed) {
      Alert.alert('Title required', 'Add a title for this recipe.');
      return;
    }

    if (trimmed === title.trim()) {
      onStopEditing();
      return;
    }

    if (await onSave(trimmed)) {
      onStopEditing();
    }
  }

  if (isEditing) {
    return (
      <View style={styles.heroEditBlock}>
        <TextInput
          accessibilityLabel="Recipe title"
          autoFocus
          multiline
          value={value}
          onChangeText={setValue}
          placeholder="Recipe title"
          placeholderTextColor={colors.muted}
          style={[styles.viewHeroTitle, styles.heroFieldInput, { color: colors.text }]}
        />
        <InlineEditActions colorScheme={colorScheme} center onCancel={onStopEditing} onSave={handleSave} />
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Edit recipe title"
      onPress={() => {
        setValue(title);
        onStartEditing();
      }}
      style={({ pressed }) => [styles.viewHeroTitleRow, { opacity: pressed ? 0.78 : 1 }]}>
      <Text style={[styles.viewHeroTitle, { color: colors.text }]} numberOfLines={3}>
        {title.trim() || 'Untitled recipe'}
      </Text>
    </Pressable>
  );
}

function EditableHeroDescription({
  colorScheme,
  description,
  isEditing,
  onStartEditing,
  onStopEditing,
  onSave,
}: {
  colorScheme: 'light' | 'dark';
  description: string;
  isEditing: boolean;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onSave: (description: string) => boolean | Promise<boolean>;
}) {
  const colors = Colors[colorScheme];
  const [value, setValue] = useState(description);

  async function handleSave() {
    const trimmed = value.trim();
    if (!trimmed) {
      Alert.alert('Description required', 'Add a description before saving this recipe.');
      return;
    }

    if (trimmed === description.trim()) {
      onStopEditing();
      return;
    }

    if (await onSave(trimmed)) {
      onStopEditing();
    }
  }

  if (isEditing) {
    return (
      <View style={styles.heroEditBlock}>
        <TextInput
          accessibilityLabel="Recipe description"
          autoFocus
          multiline
          value={value}
          onChangeText={setValue}
          placeholder="Brief dish description"
          placeholderTextColor={colors.muted}
          textAlignVertical="top"
          style={[styles.viewHeroDescription, styles.heroFieldInput, { color: colors.text }]}
        />
        <InlineEditActions colorScheme={colorScheme} center onCancel={onStopEditing} onSave={handleSave} />
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Edit recipe description"
      onPress={() => {
        setValue(description);
        onStartEditing();
      }}
      style={({ pressed }) => [styles.heroDescriptionRow, { opacity: pressed ? 0.78 : 1 }]}>
      <Text style={[styles.viewHeroDescription, { color: colors.muted }]} numberOfLines={4}>
        {description.trim() || 'Add a description'}
      </Text>
    </Pressable>
  );
}

function EditableHeroSource({
  colorScheme,
  source,
  isEditing,
  onStartEditing,
  onStopEditing,
  onSave,
}: {
  colorScheme: 'light' | 'dark';
  source?: string;
  isEditing: boolean;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onSave: (source: string | null) => boolean | Promise<boolean>;
}) {
  const colors = Colors[colorScheme];
  const [value, setValue] = useState(source ?? '');

  function startEditing() {
    setValue(source ?? '');
    onStartEditing();
  }

  function openSource() {
    if (!source) {
      return;
    }

    Linking.openURL(source).catch(() => {
      Alert.alert('Could not open link', 'This source URL could not be opened.');
    });
  }

  async function handleSave() {
    const trimmed = value.trim();
    const normalized = trimmed ? (normalizeRecipeSource(trimmed) ?? null) : null;

    if (trimmed && !normalized) {
      Alert.alert('Invalid link', 'Enter a valid http(s) URL, or clear it to remove the source.');
      return;
    }

    if ((normalized ?? '') === (source ?? '')) {
      onStopEditing();
      return;
    }

    if (await onSave(normalized)) {
      onStopEditing();
    }
  }

  if (isEditing) {
    return (
      <View style={styles.heroSourceEditor}>
        <TextInput
          accessibilityLabel="Recipe source link"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          keyboardType="url"
          value={value}
          onChangeText={setValue}
          placeholder="https://example.com/recipe"
          placeholderTextColor={colors.muted}
          style={[
            styles.heroSourceInput,
            { color: colors.text, borderColor: colors.line, backgroundColor: colors.surface },
          ]}
        />
        <InlineEditActions colorScheme={colorScheme} center onCancel={onStopEditing} onSave={handleSave} />
      </View>
    );
  }

  if (!source) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add recipe source link"
        onPress={startEditing}
        style={({ pressed }) => [styles.viewHeroSourceRow, { opacity: pressed ? 0.72 : 1 }]}>
        <SymbolView name={{ ios: 'link', android: 'link', web: 'link' }} tintColor={colors.muted} size={14} />
        <Text style={[styles.viewHeroSourceText, { color: colors.muted }]}>Add source link</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.viewHeroSourceRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Edit recipe source link"
        onPress={startEditing}
        style={({ pressed }) => [styles.viewHeroSourceLabel, { opacity: pressed ? 0.72 : 1 }]}>
        <SymbolView name={{ ios: 'link', android: 'link', web: 'link' }} tintColor={colors.tint} size={14} />
        <Text style={[styles.viewHeroSourceText, { color: colors.tint }]} numberOfLines={1}>
          {formatRecipeSourceLabel(source)}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open recipe source on ${formatRecipeSourceLabel(source)}`}
        onPress={openSource}
        hitSlop={8}
        style={({ pressed }) => [styles.viewHeroSourceOpen, { opacity: pressed ? 0.6 : 1 }]}>
        <SymbolView
          name={{ ios: 'arrow.up.right', android: 'open_in_new', web: 'open_in_new' }}
          tintColor={colors.tint}
          size={12}
        />
      </Pressable>
    </View>
  );
}

function RecipeNotesSection({
  colorScheme,
  notes,
  panelStyle,
  isEditing,
  onStartEditing,
  onStopEditing,
  onSave,
}: {
  colorScheme: 'light' | 'dark';
  notes: string;
  panelStyle: StyleProp<ViewStyle>;
  isEditing: boolean;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onSave: (notes: string) => boolean | Promise<boolean>;
}) {
  const colors = Colors[colorScheme];
  const [value, setValue] = useState('');
  const trimmedNotes = notes.trim();

  async function handleSave() {
    if (await onSave(value)) {
      onStopEditing();
    }
  }

  return (
    <View style={styles.notesBlock}>
      <ViewSectionHeader
        title="Notes"
        iconName={{ ios: 'note.text', android: 'notes', web: 'notes' }}
        colorScheme={colorScheme}
      />
      {isEditing ? (
        <View style={[styles.viewPanel, panelStyle, styles.notesPanel]}>
          <TextInput
            accessibilityLabel="Recipe notes"
            autoFocus
            multiline
            onChangeText={setValue}
            placeholder="Add a note"
            placeholderTextColor={colors.muted}
            style={[styles.notesEditorInput, { color: colors.text }]}
            textAlignVertical="top"
            value={value}
          />
          <InlineEditActions colorScheme={colorScheme} onCancel={onStopEditing} onSave={handleSave} />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={trimmedNotes ? 'Edit recipe notes' : 'Add recipe notes'}
          onPress={() => {
            setValue(notes);
            onStartEditing();
          }}
          style={({ pressed }) => [
            styles.viewPanel,
            panelStyle,
            styles.notesPanel,
            { opacity: pressed ? 0.78 : 1 },
          ]}>
          {trimmedNotes ? (
            <Text selectable style={[styles.notesText, { color: colors.text }]}>
              {trimmedNotes}
            </Text>
          ) : (
            <View style={styles.notesEmptyRow}>
              <Text style={[styles.notesPlaceholder, { color: colors.muted }]}>Add notes</Text>
              <SymbolView
                name={{ ios: 'plus.circle', android: 'add_circle', web: 'add_circle' }}
                tintColor={colors.tint}
                size={18}
              />
            </View>
          )}
        </Pressable>
      )}
    </View>
  );
}

function EditableInstructionsPanel({
  colorScheme,
  instructions,
  panelStyle,
  isEditing,
  onStartEditing,
  onStopEditing,
  onSave,
}: {
  colorScheme: 'light' | 'dark';
  instructions: string;
  panelStyle: StyleProp<ViewStyle>;
  isEditing: boolean;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onSave: (instructions: string) => boolean | Promise<boolean>;
}) {
  const colors = Colors[colorScheme];
  const stepBadgeBackground = colorScheme === 'dark' ? '#26312a' : '#edf1ea';
  const [value, setValue] = useState(instructions);

  const instructionLines = instructions
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  async function handleSave() {
    const formatted = formatNumberedInstructions(value);

    if (formatted !== value) {
      setValue(formatted);
    }

    if (formatted === instructions) {
      onStopEditing();
      return;
    }

    if (await onSave(formatted)) {
      onStopEditing();
    }
  }

  if (isEditing) {
    return (
      <View style={[styles.viewPanel, panelStyle, styles.multilineShell]}>
        <TextInput
          accessibilityLabel="Recipe instructions"
          autoFocus
          multiline
          value={value}
          onChangeText={setValue}
          onBlur={() => {
            const formatted = formatNumberedInstructions(value);
            if (formatted !== value) {
              setValue(formatted);
            }
          }}
          placeholder="Numbered cooking steps"
          placeholderTextColor={colors.muted}
          textAlignVertical="top"
          style={[styles.multilineInput, { color: colors.text }]}
        />
        <InlineEditActions colorScheme={colorScheme} onCancel={onStopEditing} onSave={handleSave} />
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Edit recipe instructions"
      onPress={() => {
        setValue(instructions);
        onStartEditing();
      }}
      style={({ pressed }) => [styles.viewPanel, panelStyle, { opacity: pressed ? 0.85 : 1 }]}>
      {instructionLines.length > 0 ? (
        instructionLines.map((line, index) => {
          const step = parseNumberedInstructionLine(line);
          const stepNumber = step.number ?? index + 1;

          return (
            <View key={`instruction-${index}`} style={styles.viewStepRow}>
              <View style={[styles.viewStepBadge, { backgroundColor: stepBadgeBackground }]}>
                <Text style={[styles.viewStepNumber, { color: colors.tint }]}>{stepNumber}</Text>
              </View>
              <Text style={[styles.viewStepText, { color: colors.text }]}>{step.text}</Text>
            </View>
          );
        })
      ) : (
        <Text style={[styles.emptyIngredients, { color: colors.muted }]}>
          Tap to add instructions.
        </Text>
      )}
    </Pressable>
  );
}

function EditableIngredientsPanel({
  colorScheme,
  ingredients,
  panelStyle,
  isEditing,
  onStartEditing,
  onStopEditing,
  onSave,
}: {
  colorScheme: 'light' | 'dark';
  ingredients: RecipeIngredient[];
  panelStyle: StyleProp<ViewStyle>;
  isEditing: boolean;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onSave: (ingredients: RecipeIngredient[]) => boolean | Promise<boolean>;
}) {
  const colors = Colors[colorScheme];
  const inputShell = {
    backgroundColor: colors.surface,
    borderColor: colors.line,
  };
  const [draftIngredients, setDraftIngredients] = useState<RecipeIngredient[]>(ingredients);

  const shoppingListItems = useShoppingListItems();
  const shoppingListItemIdsByText = useMemo(() => {
    const map = new Map<string, string>();

    for (const item of shoppingListItems) {
      map.set(item.text.toLowerCase(), item.id);
    }

    return map;
  }, [shoppingListItems]);

  const visibleIngredients = ingredients.filter((ingredient) => ingredient.name.trim());

  function handleToggleIngredientInList(ingredient: RecipeIngredient) {
    const ingredientLabel = formatIngredient(ingredient);
    const existingItemId = shoppingListItemIdsByText.get(ingredientLabel.toLowerCase());

    if (existingItemId) {
      void deleteShoppingListItem(existingItemId);
      return;
    }

    void addShoppingListItem(ingredientLabel);
  }

  function startEditing() {
    setDraftIngredients(
      ingredients.length > 0 ? ingredients.map((ingredient) => ({ ...ingredient })) : [emptyIngredient()],
    );
    onStartEditing();
  }

  function updateIngredient(index: number, patch: Partial<RecipeIngredient>) {
    setDraftIngredients((current) =>
      current.map((ingredient, ingredientIndex) =>
        ingredientIndex === index ? { ...ingredient, ...patch } : ingredient,
      ),
    );
  }

  function addIngredient() {
    setDraftIngredients((current) => [...current, emptyIngredient()]);
  }

  function removeIngredient(index: number) {
    setDraftIngredients((current) => current.filter((_, ingredientIndex) => ingredientIndex !== index));
  }

  async function handleSave() {
    if (await onSave(draftIngredients)) {
      onStopEditing();
    }
  }

  if (isEditing) {
    return (
      <View style={[styles.viewPanel, panelStyle, styles.ingredientsEditPanel]}>
        <View style={styles.editorIngredientList}>
          {draftIngredients.map((ingredient, index) => (
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
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add ingredient"
          onPress={addIngredient}
          style={({ pressed }) => [styles.addIngredientRow, { opacity: pressed ? 0.7 : 1 }]}>
          <SymbolView
            name={{ ios: 'plus.circle', android: 'add_circle', web: 'add_circle' }}
            tintColor={colors.tint}
            size={18}
          />
          <Text style={[styles.addIngredientText, { color: colors.tint }]}>Add ingredient</Text>
        </Pressable>
        <InlineEditActions colorScheme={colorScheme} onCancel={onStopEditing} onSave={handleSave} />
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Edit recipe ingredients"
      onPress={startEditing}
      style={({ pressed }) => [styles.viewPanel, panelStyle, { opacity: pressed ? 0.85 : 1 }]}>
      {visibleIngredients.length > 0 ? (
        visibleIngredients.map((ingredient, index) => {
          const ingredientLabel = formatIngredient(ingredient);
          const { amount, name } = getIngredientParts(ingredient);
          const isInList = shoppingListItemIdsByText.has(ingredientLabel.toLowerCase());

          return (
            <View key={`ingredient-${index}`}>
              {index > 0 ? <View style={[styles.viewDivider, { backgroundColor: colors.line }]} /> : null}
              <View style={styles.viewIngredientRow}>
                <View style={[styles.viewIngredientDot, { backgroundColor: colors.tint }]} />
                <Text style={[styles.viewIngredientText, { color: colors.text }]}>
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
                    tintColor={isInList ? (colorScheme === 'dark' ? '#102015' : '#ffffff') : colors.tint}
                    size={16}
                  />
                </Pressable>
              </View>
            </View>
          );
        })
      ) : (
        <Text style={[styles.emptyIngredients, { color: colors.muted }]}>Tap to add ingredients.</Text>
      )}
    </Pressable>
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

function HeaderDeleteButton({
  colorScheme,
  onPress,
}: {
  colorScheme: 'light' | 'dark';
  onPress: () => void;
}) {
  const colors = Colors[colorScheme];

  return (
    <HeaderChipButton accessibilityLabel="Delete recipe" colorScheme={colorScheme} onPress={onPress}>
      <SymbolView
        name={{ ios: 'trash', android: 'delete', web: 'delete' }}
        tintColor={colors.accent}
        size={18}
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
  addIngredientRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
  },
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
  contentViewing: {
    paddingHorizontal: 0,
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
  heroDescriptionRow: {
    alignSelf: 'stretch',
  },
  heroEditBlock: {
    alignSelf: 'stretch',
    gap: 10,
  },
  heroFieldInput: {
    alignSelf: 'stretch',
    paddingVertical: 0,
  },
  heroSourceEditor: {
    alignSelf: 'stretch',
    gap: 10,
  },
  heroSourceInput: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 9,
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
  ingredientsEditPanel: {
    gap: 12,
  },
  inlineActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  inlineActionsCenter: {
    justifyContent: 'center',
  },
  inlineButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 82,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  inlineButtonText: {
    fontSize: 14,
    fontWeight: '800',
  },
  notesBlock: {
    gap: 14,
  },
  notesEditorInput: {
    fontSize: 15,
    lineHeight: 22,
    minHeight: 84,
  },
  notesEmptyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  notesPanel: {
    gap: 10,
    minHeight: 50,
  },
  notesPlaceholder: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  notesText: {
    fontSize: 15,
    lineHeight: 22,
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
  removeIngredientButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  recipeHeroImage: {
    height: '100%',
    width: '100%',
  },
  recipeHeroImageFrame: {
    aspectRatio: 1.33,
    marginBottom: 18,
    marginHorizontal: -24,
    marginTop: -14,
    overflow: 'hidden',
  },
  recipeHeroImagePlaceholder: {
    alignItems: 'center',
    aspectRatio: 1.33,
    gap: 8,
    justifyContent: 'center',
    marginBottom: 18,
    marginHorizontal: -24,
    marginTop: -14,
    paddingHorizontal: 24,
  },
  recipeHeroImageRetryButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  recipeHeroImageRetryText: {
    fontSize: 13,
    fontWeight: '800',
  },
  recipeHeroImageStateText: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  screen: {
    flex: 1,
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
  viewHeroSourceLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 6,
    minWidth: 0,
  },
  viewHeroSourceOpen: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
    minWidth: 28,
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
