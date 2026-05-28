import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import {
  addShoppingListItem,
  clearCompletedShoppingListItems,
  deleteShoppingListItem,
  toggleShoppingListItem,
  type ShoppingListItem,
  useShoppingListItems,
} from '@/utils/shopping-list-store';

export default function ShoppingListScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const items = useShoppingListItems();
  const [draft, setDraft] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const completedCount = useMemo(
    () => items.filter((item) => item.completed).length,
    [items],
  );
  const remainingCount = items.length - completedCount;
  const canAdd = draft.trim().length > 0;

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

  const inputDockPaddingBottom =
    keyboardHeight > 0 ? keyboardHeight + 12 : Math.max(insets.bottom, 12) + 12;

  function handleAddItem() {
    if (!canAdd) {
      return;
    }

    addShoppingListItem(draft);
    setDraft('');
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
          style={styles.list}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          data={items}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.headerTop}>
                <View style={styles.titleBlock}>
                  <Text selectable style={[styles.kicker, { color: colors.tint }]}>
                    Shopping List
                  </Text>
                  <Text selectable style={[styles.summary, { color: colors.muted }]}>
                    {items.length === 0
                      ? 'Add what you need before your next grocery run.'
                      : `${remainingCount} left · ${completedCount} checked off`}
                  </Text>
                </View>
                {completedCount > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear completed items"
                    onPress={clearCompletedShoppingListItems}
                    style={({ pressed }) => [
                      styles.clearButton,
                      {
                        backgroundColor: colorScheme === 'dark' ? '#26312a' : '#edf1ea',
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}>
                    <Text style={[styles.clearButtonText, { color: colors.tint }]}>Clear</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          }
          ListEmptyComponent={
            <View
              style={[
                styles.emptyState,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.line,
                },
              ]}>
              <SymbolView
                name={{ ios: 'cart', android: 'shopping_cart', web: 'shopping_cart' }}
                tintColor={colors.tint}
                size={38}
              />
              <Text selectable style={[styles.emptyTitle, { color: colors.text }]}>
                Your list is empty
              </Text>
              <Text selectable style={[styles.emptyCopy, { color: colors.muted }]}>
                Type an item below and press return or the plus button to add it here.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <ShoppingListRow
              item={item}
              colorScheme={colorScheme}
              onToggle={toggleShoppingListItem}
              onDelete={deleteShoppingListItem}
            />
          )}
          contentContainerStyle={[
            styles.content,
            {
              paddingHorizontal: width >= 800 ? 28 : 18,
              paddingTop: 22,
            },
            items.length === 0 ? styles.emptyContent : null,
          ]}
        />
      <View
        style={[
          styles.inputDock,
          {
            paddingBottom: inputDockPaddingBottom,
            paddingHorizontal: width >= 800 ? 28 : 18,
          },
        ]}>
          <View
            style={[
              styles.inputShell,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
              },
            ]}>
            <TextInput
              accessibilityLabel="Shopping list item"
              value={draft}
              onChangeText={setDraft}
              placeholder="Add eggs, lemons, parchment paper..."
              placeholderTextColor={colors.muted}
              returnKeyType="done"
              submitBehavior="submit"
              onSubmitEditing={handleAddItem}
              style={[styles.input, { color: colors.text }]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add item"
              disabled={!canAdd}
              onPress={handleAddItem}
              style={({ pressed }) => [
                styles.addButton,
                {
                  backgroundColor: canAdd ? colors.tint : colorScheme === 'dark' ? '#26312a' : '#e4ebe5',
                  opacity: pressed ? 0.72 : 1,
                },
              ]}>
              <SymbolView
                name={{ ios: 'plus', android: 'add', web: 'add' }}
                tintColor={canAdd ? (colorScheme === 'dark' ? '#102015' : '#ffffff') : colors.muted}
                size={18}
              />
            </Pressable>
          </View>
        </View>
    </View>
  );
}

function ShoppingListRow({
  item,
  colorScheme,
  onToggle,
  onDelete,
}: {
  item: ShoppingListItem;
  colorScheme: 'light' | 'dark';
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const colors = Colors[colorScheme];

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
          boxShadow: colorScheme === 'dark' ? '0 10px 22px rgba(0,0,0,0.22)' : '0 12px 26px rgba(22,42,33,0.08)',
        },
      ]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.completed }}
        accessibilityLabel={`${item.completed ? 'Uncheck' : 'Check'} ${item.text}`}
        onPress={() => onToggle(item.id)}
        style={({ pressed }) => [
          styles.checkButton,
          {
            backgroundColor: item.completed ? colors.tint : colorScheme === 'dark' ? '#26312a' : '#edf1ea',
            borderColor: item.completed ? colors.tint : colors.line,
            opacity: pressed ? 0.72 : 1,
          },
        ]}>
        {item.completed ? (
          <SymbolView
            name={{ ios: 'checkmark', android: 'check', web: 'check' }}
            tintColor={colorScheme === 'dark' ? '#102015' : '#ffffff'}
            size={16}
          />
        ) : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.completed ? 'Uncheck' : 'Check'} ${item.text}`}
        onPress={() => onToggle(item.id)}
        style={styles.rowTextButton}>
        <Text
          selectable
          style={[
            styles.itemText,
            {
              color: item.completed ? colors.muted : colors.text,
              textDecorationLine: item.completed ? 'line-through' : 'none',
            },
          ]}>
          {item.text}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${item.text}`}
        hitSlop={8}
        onPress={() => onDelete(item.id)}
        style={({ pressed }) => [
          styles.deleteButton,
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

const styles = StyleSheet.create({
  addButton: {
    alignItems: 'center',
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  checkButton: {
    alignItems: 'center',
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  clearButton: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '800',
  },
  content: {
    gap: 12,
    minHeight: '100%',
    paddingBottom: 32,
  },
  inputDock: {
    gap: 0,
    paddingTop: 8,
  },
  deleteButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  emptyContent: {
    flexGrow: 1,
  },
  emptyCopy: {
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 360,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    justifyContent: 'center',
    minHeight: 260,
    padding: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  header: {
    paddingBottom: 6,
  },
  headerTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
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
  itemText: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23,
  },
  kicker: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  list: {
    flex: 1,
  },
  row: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowTextButton: {
    flex: 1,
    minWidth: 0,
  },
  screen: {
    flex: 1,
  },
  summary: {
    fontSize: 15,
    lineHeight: 20,
  },
  titleBlock: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
});
