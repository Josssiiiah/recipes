import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  View,
} from 'react-native';

import { RecipeImportProgress } from '@/components/recipe-import-progress';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useKeyboardDockPadding } from '@/utils/use-keyboard-dock-padding';
import {
  detectRecipeImportKind,
  type RecipeImportKind,
} from '@/utils/detect-recipe-import-kind';
import { getImageMimeType, loadImagePicker } from '@/utils/image-picker';
import {
  startRecipeGenerationFromImage,
  startRecipeGenerationFromInput,
} from '@/utils/recipe-store';

export default function NewRecipeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const composerPaddingBottom = useKeyboardDockPadding();
  const [importProgress, setImportProgress] = useState<{
    kind: RecipeImportKind;
    phase: 'working' | 'ready';
  } | null>(null);
  const canSubmit = prompt.trim().length > 0 && !isSubmitting;

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
      await startRecipeGenerationFromInput(trimmedPrompt);
      await finishQueuedImport(importKind);
    } catch (error) {
      setImportProgress(null);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function finishQueuedImport(kind: RecipeImportKind) {
    setPrompt('');
    setImportProgress({ kind, phase: 'ready' });
    await wait(500);
    router.replace('/');
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

      await startRecipeGenerationFromImage({
        imageBase64: asset.base64,
        mimeType: getImageMimeType(asset.mimeType, asset.uri),
      });
      await finishQueuedImport('image');
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
            placeholder="Paste link or recipe"
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
