import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import {
  recipeImportConfig,
  type RecipeImportKind,
} from '@/utils/detect-recipe-import-kind';

type RecipeImportProgressProps = {
  kind: RecipeImportKind;
  phase: 'working' | 'ready';
  colorScheme: 'light' | 'dark';
};

const stepIntervalMs = 2400;

export function RecipeImportProgress({ kind, phase, colorScheme }: RecipeImportProgressProps) {
  const colors = Colors[colorScheme];
  const config = recipeImportConfig[kind];
  const [activeStep, setActiveStep] = useState(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [pulse]);

  useEffect(() => {
    setActiveStep(0);

    if (phase === 'ready') {
      return;
    }

    const timer = setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, config.steps.length - 1));
    }, stepIntervalMs);

    return () => clearInterval(timer);
  }, [config.steps.length, kind, phase]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: phase === 'ready' ? 1 : pulse.value }],
  }));

  const completedSteps = phase === 'ready' ? config.steps.length : activeStep;

  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.overlay}>
      <Animated.View
        entering={FadeInUp.duration(280).springify()}
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            boxShadow:
              colorScheme === 'dark'
                ? '0 18px 40px rgba(0,0,0,0.45)'
                : '0 18px 40px rgba(22,42,33,0.14)',
          },
        ]}>
        <Animated.View
          style={[
            styles.iconShell,
            iconStyle,
            {
              backgroundColor: colorScheme === 'dark' ? '#243129' : '#e8f2eb',
            },
          ]}>
          {phase === 'ready' ? (
            <SymbolView
              name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }}
              tintColor={colors.tint}
              size={34}
            />
          ) : (
            <SymbolView name={config.icon} tintColor={colors.tint} size={34} />
          )}
        </Animated.View>

        <Text style={[styles.title, { color: colors.text }]}>
          {phase === 'ready' ? 'Generation queued' : 'Starting recipe'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          {phase === 'ready' ? 'Returning to your library...' : config.label}
        </Text>

        <View style={styles.steps}>
          {config.steps.map((step, index) => {
            const done = index < completedSteps;
            const current = phase !== 'ready' && index === activeStep;

            return (
              <View key={step} style={styles.stepRow}>
                <View
                  style={[
                    styles.stepMarker,
                    {
                      backgroundColor: done
                        ? colors.tint
                        : colorScheme === 'dark'
                          ? '#2a3530'
                          : '#e4ebe5',
                      borderColor: current ? colors.tint : 'transparent',
                      borderWidth: current ? 2 : 0,
                    },
                  ]}>
                  {done ? (
                    <SymbolView
                      name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                      tintColor={colorScheme === 'dark' ? '#102015' : '#ffffff'}
                      size={11}
                    />
                  ) : current ? (
                    <ActivityIndicator color={colors.tint} size="small" />
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.stepText,
                    {
                      color: done || current ? colors.text : colors.muted,
                      fontWeight: current ? '700' : '500',
                    },
                  ]}>
                  {step}
                </Text>
              </View>
            );
          })}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    maxWidth: 340,
    paddingHorizontal: 24,
    paddingVertical: 28,
    width: '100%',
  },
  iconShell: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 28,
    height: 72,
    justifyContent: 'center',
    marginBottom: 4,
    width: 72,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: 'rgba(17, 21, 19, 0.42)',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 10,
  },
  stepMarker: {
    alignItems: 'center',
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  stepRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  steps: {
    gap: 12,
    marginTop: 12,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    textAlign: 'center',
  },
});
