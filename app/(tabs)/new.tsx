import { SymbolView } from 'expo-symbols';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RecipeImportProgress } from '@/components/recipe-import-progress';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { RecipeInput } from '@/types/recipe';
import {
  detectRecipeImportKind,
  type RecipeImportKind,
} from '@/utils/detect-recipe-import-kind';
import { importRecipeFromImage, importRecipeFromInput } from '@/utils/recipe-api';
import { addRecipe } from '@/utils/recipe-store';

export default function NewRecipeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [importProgress, setImportProgress] = useState<{
    kind: RecipeImportKind;
    phase: 'working' | 'ready';
  } | null>(null);
  const canSubmit = prompt.trim().length > 0 && !isSubmitting;

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

  async function handleSubmit() {
    if (!canSubmit) {
      return;
    }

    const trimmedPrompt = prompt.trim();
    const importKind = detectRecipeImportKind(trimmedPrompt);

    setIsSubmitting(true);
    setErrorMessage('');
    setImportProgress({ kind: importKind, phase: 'working' });

    try {
      const recipe = await importRecipeFromInput(trimmedPrompt);
      await finishImport(recipe, importKind);
    } catch (error) {
      setImportProgress(null);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function finishImport(recipe: RecipeInput, kind: RecipeImportKind) {
    const savedRecipe = addRecipe(recipe);

    setPrompt('');
    setImportProgress({ kind, phase: 'ready' });
    await wait(500);
    router.replace(`/recipe/${savedRecipe.id}`);
    setImportProgress(null);
  }

  async function handlePickImage() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const ImagePicker = await loadImagePicker();

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        base64: true,
        quality: 0.85,
        selectionLimit: 1,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];

      if (!asset?.base64) {
        throw new Error('Recipe image did not include readable image data.');
      }

      setImportProgress({ kind: 'image', phase: 'working' });

      const recipe = await importRecipeFromImage({
        imageBase64: asset.base64,
        mimeType: getImageMimeType(asset.mimeType, asset.uri),
      });
      await finishImport(recipe, 'image');
    } catch (error) {
      setImportProgress(null);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handlePromptChange(value: string) {
    setPrompt(value);
    if (errorMessage) {
      setErrorMessage('');
    }
  }

  const composerPaddingBottom =
    keyboardHeight > 0 ? keyboardHeight + 12 : Math.max(insets.bottom, 12) + 12;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {importProgress ? (
        <RecipeImportProgress
          kind={importProgress.kind}
          phase={importProgress.phase}
          colorScheme={colorScheme}
        />
      ) : null}

      <View style={styles.spacer} />

      <View
        style={[
          styles.composer,
          {
            paddingBottom: composerPaddingBottom,
            paddingHorizontal: 18,
          },
        ]}>
        {errorMessage ? (
          <View
            style={[
              styles.errorBox,
              {
                backgroundColor: colorScheme === 'dark' ? '#351f1a' : '#fff0eb',
                borderColor: colors.accent,
              },
            ]}>
            <Text selectable style={[styles.errorText, { color: colors.accent }]}>
              {errorMessage}
            </Text>
          </View>
        ) : null}

        <View
          style={[
            styles.inputShell,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
            },
          ]}>
          <TextInput
            accessibilityLabel="Recipe prompt"
            value={prompt}
            onChangeText={handlePromptChange}
            multiline
            editable={!isSubmitting}
            placeholder="Paste a recipe, link, or YouTube URL"
            placeholderTextColor={colors.muted}
            returnKeyType="send"
            submitBehavior="submit"
            blurOnSubmit={false}
            onSubmitEditing={handleSubmit}
            textAlignVertical="center"
            style={[styles.input, { color: colors.text }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Import recipe image"
            disabled={isSubmitting}
            onPress={handlePickImage}
            style={({ pressed }) => [
              styles.imageButton,
              {
                backgroundColor: colorScheme === 'dark' ? '#26312a' : '#edf2ee',
                opacity: pressed && !isSubmitting ? 0.75 : isSubmitting ? 0.55 : 1,
              },
            ]}>
            <SymbolView
              name={{ ios: 'photo', android: 'photo_library', web: 'photo_library' }}
              tintColor={colors.tint}
              size={18}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Generate recipe"
            disabled={!canSubmit}
            onPress={handleSubmit}
            style={({ pressed }) => [
              styles.submitButton,
              {
                backgroundColor: canSubmit ? colors.tint : colorScheme === 'dark' ? '#26312a' : '#e4ebe5',
                opacity: pressed && canSubmit ? 0.75 : 1,
              },
            ]}>
            {isSubmitting ? (
              <ActivityIndicator
                color={colorScheme === 'dark' ? '#102015' : '#ffffff'}
                size="small"
              />
            ) : (
              <SymbolView
                name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }}
                tintColor={canSubmit ? (colorScheme === 'dark' ? '#102015' : '#ffffff') : colors.muted}
                size={18}
              />
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function wait(durationMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

async function loadImagePicker() {
  const nativeImagePicker = requireOptionalNativeModule('ExponentImagePicker');

  if (!nativeImagePicker) {
    throw new Error(
      'Image import needs the dev client rebuilt with expo-image-picker before it can read photos.',
    );
  }

  try {
    const ImagePicker = await import('expo-image-picker');

    if (typeof ImagePicker.launchImageLibraryAsync !== 'function') {
      throw new Error('expo-image-picker did not expose launchImageLibraryAsync.');
    }

    return ImagePicker;
  } catch (error) {
    const message = getErrorMessage(error);

    if (message.includes('ExponentImagePicker')) {
      throw new Error(
        'Image import needs the dev client rebuilt with expo-image-picker before it can read photos.',
      );
    }

    throw new Error(`Image picker is not available: ${message}`);
  }
}

function getImageMimeType(mimeType?: string, uri?: string) {
  const normalized = mimeType?.toLowerCase();

  if (normalized === 'image/jpeg' || normalized === 'image/png' || normalized === 'image/webp') {
    return normalized;
  }

  if (uri?.toLowerCase().endsWith('.png')) {
    return 'image/png';
  }

  if (uri?.toLowerCase().endsWith('.webp')) {
    return 'image/webp';
  }

  return 'image/jpeg';
}

const styles = StyleSheet.create({
  composer: {
    gap: 10,
    paddingTop: 8,
  },
  errorBox: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    maxHeight: 120,
    minHeight: 22,
    paddingVertical: 0,
  },
  imageButton: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
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
  screen: {
    flex: 1,
  },
  spacer: {
    flex: 1,
  },
  submitButton: {
    alignItems: 'center',
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
});
