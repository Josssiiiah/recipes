import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import {
  addInventoryItem,
  deleteInventoryItem,
  setAddCompletedShoppingItemsToInventory,
  setInventoryViewMode,
  type InventoryItem,
  type InventoryViewMode,
  useAddCompletedShoppingItemsToInventory,
  useInventoryItems,
  useInventoryViewMode,
} from '@/utils/inventory-store';
import { getImageMimeType, loadImagePicker } from '@/utils/image-picker';
import { scanInventoryFromImage, type InventoryScanItem } from '@/utils/recipe-api';
import { useKeyboardDockPadding } from '@/utils/use-keyboard-dock-padding';
import {
  addShoppingListItem,
  clearCompletedShoppingListItems,
  deleteShoppingListItem,
  toggleShoppingListItem,
  type ShoppingListItem,
  useShoppingListItems,
} from '@/utils/shopping-list-store';

type ListSegment = 'shopping' | 'inventory';

type PendingInventoryScanItem = InventoryScanItem & {
  id: string;
  selected: boolean;
};

const inventoryDateMonths = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatInventoryAddedDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  if (!match) {
    return `Added ${date}`;
  }

  const month = inventoryDateMonths[Number(match[2]) - 1];
  const day = Number(match[3]);

  if (!month || !Number.isFinite(day)) {
    return `Added ${date}`;
  }

  return `Added ${month} ${day}, ${match[1]}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function ListScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const horizontalPadding = width >= 800 ? 28 : 18;

  const [segment, setSegment] = useState<ListSegment>('shopping');

  const shoppingItems = useShoppingListItems();
  const inventoryItems = useInventoryItems();
  const completedCount = useMemo(
    () => shoppingItems.filter((item) => item.completed).length,
    [shoppingItems],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.headerBlock, { paddingHorizontal: horizontalPadding }]}>
        <SegmentToggle
          segment={segment}
          colorScheme={colorScheme}
          onChange={setSegment}
        />
      </View>
      {segment === 'shopping' ? (
        <ShoppingSection
          items={shoppingItems}
          completedCount={completedCount}
          colorScheme={colorScheme}
          horizontalPadding={horizontalPadding}
        />
      ) : (
        <InventorySection
          items={inventoryItems}
          colorScheme={colorScheme}
          horizontalPadding={horizontalPadding}
        />
      )}
    </View>
  );
}

function SegmentToggle({
  segment,
  colorScheme,
  onChange,
}: {
  segment: ListSegment;
  colorScheme: 'light' | 'dark';
  onChange: (segment: ListSegment) => void;
}) {
  const colors = Colors[colorScheme];

  return (
    <View
      style={[
        styles.segmentRow,
        {
          backgroundColor: colorScheme === 'dark' ? '#1f2723' : '#eef2ec',
          borderColor: colors.line,
        },
      ]}>
      <SegmentButton
        label="Shopping"
        icon={{ ios: 'cart', android: 'shopping_cart', web: 'shopping_cart' }}
        active={segment === 'shopping'}
        colorScheme={colorScheme}
        onPress={() => onChange('shopping')}
      />
      <SegmentButton
        label="Inventory"
        icon={{ ios: 'refrigerator', android: 'kitchen', web: 'kitchen' }}
        active={segment === 'inventory'}
        colorScheme={colorScheme}
        onPress={() => onChange('inventory')}
      />
    </View>
  );
}

function SegmentButton({
  label,
  icon,
  active,
  colorScheme,
  onPress,
}: {
  label: string;
  icon: Parameters<typeof SymbolView>[0]['name'];
  active: boolean;
  colorScheme: 'light' | 'dark';
  onPress: () => void;
}) {
  const colors = Colors[colorScheme];

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} view`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segmentButton,
        active && {
          backgroundColor: colors.surface,
          boxShadow:
            colorScheme === 'dark'
              ? '0 4px 12px rgba(0,0,0,0.28)'
              : '0 4px 12px rgba(22,42,33,0.1)',
        },
        { opacity: pressed && !active ? 0.7 : 1 },
      ]}>
      <SymbolView name={icon} tintColor={active ? colors.tint : colors.muted} size={16} />
      <Text
        style={[
          styles.segmentLabel,
          { color: active ? colors.text : colors.muted },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ShoppingSection({
  items,
  completedCount,
  colorScheme,
  horizontalPadding,
}: {
  items: ShoppingListItem[];
  completedCount: number;
  colorScheme: 'light' | 'dark';
  horizontalPadding: number;
}) {
  const colors = Colors[colorScheme];
  const [draft, setDraft] = useState('');
  const inputDockPaddingBottom = useKeyboardDockPadding();
  const remainingCount = items.length - completedCount;
  const canAdd = draft.trim().length > 0;

  async function handleAddItem() {
    if (!canAdd) {
      return;
    }

    const item = await addShoppingListItem(draft);
    if (!item) {
      return;
    }

    setDraft('');
  }

  return (
    <>
      <FlatList
        style={styles.list}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        scrollEnabled={items.length > 0}
        data={items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.subheadRow}>
            <Text selectable style={[styles.summary, { color: colors.muted }]}>
              {items.length === 0
                ? 'Add what you need before your next grocery run.'
                : `${remainingCount} left · ${completedCount} checked off`}
            </Text>
            {completedCount > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear completed items"
                onPress={() => {
                  void clearCompletedShoppingListItems();
                }}
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
          { paddingHorizontal: horizontalPadding },
          items.length === 0 ? styles.emptyContent : null,
        ]}
      />
      <View
        style={[
          styles.inputDock,
          {
            paddingBottom: inputDockPaddingBottom,
            paddingHorizontal: horizontalPadding,
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
            placeholder="Add shopping item"
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
    </>
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
  onToggle: (id: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const colors = Colors[colorScheme];

  return (
    <View
      style={[
        styles.shoppingRow,
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
        onPress={() => {
          void onToggle(item.id);
        }}
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
        onPress={() => {
          void onToggle(item.id);
        }}
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
        onPress={() => {
          void onDelete(item.id);
        }}
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

function InventorySection({
  items,
  colorScheme,
  horizontalPadding,
}: {
  items: InventoryItem[];
  colorScheme: 'light' | 'dark';
  horizontalPadding: number;
}) {
  const colors = Colors[colorScheme];
  const viewMode = useInventoryViewMode();
  const addCompletedShoppingItemsToInventory = useAddCompletedShoppingItemsToInventory();
  const [draft, setDraft] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [pendingScanItems, setPendingScanItems] = useState<PendingInventoryScanItem[]>([]);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const inputDockPaddingBottom = useKeyboardDockPadding();
  const columns = viewMode === 'list' ? 1 : 2;
  const canAdd = draft.trim().length > 0 && !isScanning;
  const selectedScanCount = useMemo(
    () => pendingScanItems.filter((item) => item.selected).length,
    [pendingScanItems],
  );
  const itemSummary = useMemo(() => {
    if (items.length === 0) {
      return 'Track the food you already have at home.';
    }

    return `${items.length} ${items.length === 1 ? 'item' : 'items'} on hand`;
  }, [items.length]);

  async function handleAddItem() {
    if (!canAdd) {
      return;
    }

    const item = await addInventoryItem(draft);
    if (!item) {
      setScanError('Could not add that inventory item. Try again.');
      return;
    }

    setDraft('');
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    if (scanError) {
      setScanError('');
    }
  }

  async function handleCaptureInventory() {
    if (isScanning) {
      return;
    }

    Keyboard.dismiss();
    setIsScanning(true);
    setScanError('');

    try {
      const ImagePicker = await loadImagePicker();
      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        throw new Error('Camera access is required to scan inventory.');
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        base64: true,
        quality: 0.75,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];

      if (!asset?.base64) {
        throw new Error('Inventory photo did not include readable image data.');
      }

      const scan = await scanInventoryFromImage({
        imageBase64: asset.base64,
        mimeType: getImageMimeType(asset.mimeType, asset.uri),
      });
      const timestamp = Date.now();
      const detectedItems = scan.items.map((item, index) => ({
        ...item,
        id: `${timestamp}-${index}-${item.text}`,
        selected: true,
      }));

      if (detectedItems.length === 0) {
        setScanError(
          'No food items were detected in that photo. Try a clearer pantry, fridge, or freezer shot.',
        );
        return;
      }

      setPendingScanItems(detectedItems);
    } catch (error) {
      setScanError(getErrorMessage(error));
    } finally {
      setIsScanning(false);
    }
  }

  function handleToggleScanItem(id: string) {
    setPendingScanItems((currentItems) =>
      currentItems.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item,
      ),
    );
  }

  async function handleAcceptSelectedScanItems() {
    const selectedItems = pendingScanItems.filter((item) => item.selected);

    if (selectedItems.length === 0) {
      return;
    }

    await Promise.all(selectedItems.map((item) => addInventoryItem(item.text)));
    setPendingScanItems([]);
  }

  async function handleAcceptAllScanItems() {
    await Promise.all(pendingScanItems.map((item) => addInventoryItem(item.text)));
    setPendingScanItems([]);
  }

  return (
    <>
      <FlatList
        style={styles.list}
        key={`${viewMode}-${columns}`}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        scrollEnabled={items.length > 0}
        data={items}
        keyExtractor={(item) => item.id}
        numColumns={columns}
        ListHeaderComponent={
          <View style={styles.subheadRow}>
            <Text selectable style={[styles.summary, { color: colors.muted }]}>
              {itemSummary}
            </Text>
            <View style={styles.headerActions}>
              <View
                style={[
                  styles.viewToggle,
                  {
                    backgroundColor: colorScheme === 'dark' ? '#1f2723' : '#eef2ec',
                    borderColor: colors.line,
                  },
                ]}>
                <ViewModeButton
                  mode="grid"
                  selectedMode={viewMode}
                  colorScheme={colorScheme}
                  onPress={setInventoryViewMode}
                />
                <ViewModeButton
                  mode="list"
                  selectedMode={viewMode}
                  colorScheme={colorScheme}
                  onPress={setInventoryViewMode}
                />
              </View>
              <InventorySettingsButton
                colorScheme={colorScheme}
                onPress={() => setSettingsVisible(true)}
              />
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
              name={{ ios: 'refrigerator', android: 'kitchen', web: 'kitchen' }}
              tintColor={colors.tint}
              size={38}
            />
            <Text selectable style={[styles.emptyTitle, { color: colors.text }]}>
              No inventory yet
            </Text>
            <Text selectable style={[styles.emptyCopy, { color: colors.muted }]}>
              Add pantry, fridge, or freezer items below so recipes can reference them later.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[viewMode === 'list' ? styles.listItem : styles.gridItem, { width: `${100 / columns}%` }]}>
            <InventoryItemCard
              item={item}
              colorScheme={colorScheme}
              variant={viewMode}
              onDelete={deleteInventoryItem}
            />
          </View>
        )}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: horizontalPadding },
          items.length === 0 ? styles.emptyContent : null,
        ]}
      />
      <View
        style={[
          styles.inputDock,
          {
            paddingBottom: inputDockPaddingBottom,
            paddingHorizontal: horizontalPadding,
          },
        ]}>
        {scanError ? (
          <View
            style={[
              styles.errorBox,
              {
                backgroundColor: colorScheme === 'dark' ? '#351f1a' : '#fff0eb',
                borderColor: colors.accent,
              },
            ]}>
            <Text selectable style={[styles.errorText, { color: colors.accent }]}>
              {scanError}
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
            accessibilityLabel="Inventory item"
            value={draft}
            onChangeText={handleDraftChange}
            placeholder="Add an item"
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            submitBehavior="submit"
            onSubmitEditing={handleAddItem}
            style={[styles.input, { color: colors.text }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan inventory with camera"
            disabled={isScanning}
            onPress={handleCaptureInventory}
            style={({ pressed }) => [
              styles.cameraButton,
              {
                backgroundColor: colorScheme === 'dark' ? '#26312a' : '#edf2ee',
                opacity: pressed && !isScanning ? 0.75 : isScanning ? 0.55 : 1,
              },
            ]}>
            {isScanning ? (
              <ActivityIndicator color={colors.tint} size="small" />
            ) : (
              <SymbolView
                name={{ ios: 'camera', android: 'photo_camera', web: 'photo_camera' }}
                tintColor={colors.tint}
                size={18}
              />
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add inventory item"
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
      <InventoryScanReviewModal
        visible={pendingScanItems.length > 0}
        items={pendingScanItems}
        selectedCount={selectedScanCount}
        colorScheme={colorScheme}
        onToggle={handleToggleScanItem}
        onAcceptSelected={handleAcceptSelectedScanItems}
        onAcceptAll={handleAcceptAllScanItems}
        onClose={() => setPendingScanItems([])}
      />
      <InventorySettingsModal
        visible={settingsVisible}
        addCompletedShoppingItemsToInventory={addCompletedShoppingItemsToInventory}
        colorScheme={colorScheme}
        onToggleAddCompletedShoppingItemsToInventory={setAddCompletedShoppingItemsToInventory}
        onClose={() => setSettingsVisible(false)}
      />
    </>
  );
}

function ViewModeButton({
  mode,
  selectedMode,
  colorScheme,
  onPress,
}: {
  mode: InventoryViewMode;
  selectedMode: InventoryViewMode;
  colorScheme: 'light' | 'dark';
  onPress: (mode: InventoryViewMode) => void;
}) {
  const colors = Colors[colorScheme];
  const selected = mode === selectedMode;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={mode === 'grid' ? 'Grid view' : 'List view'}
      onPress={() => onPress(mode)}
      style={({ pressed }) => [
        styles.viewModeButton,
        {
          backgroundColor: selected
            ? colorScheme === 'dark'
              ? '#2a3530'
              : '#e4ebe5'
            : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <SymbolView
        name={
          mode === 'grid'
            ? { ios: 'square.grid.2x2', android: 'grid_view', web: 'grid_view' }
            : { ios: 'list.bullet', android: 'format_list_bulleted', web: 'format_list_bulleted' }
        }
        tintColor={selected ? colors.tint : colors.muted}
        size={18}
      />
    </Pressable>
  );
}

function InventorySettingsButton({
  colorScheme,
  onPress,
}: {
  colorScheme: 'light' | 'dark';
  onPress: () => void;
}) {
  const colors = Colors[colorScheme];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Inventory settings"
      onPress={onPress}
      style={({ pressed }) => [
        styles.settingsButton,
        {
          backgroundColor: colorScheme === 'dark' ? '#1f2723' : '#eef2ec',
          borderColor: colors.line,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <SymbolView
        name={{ ios: 'gearshape', android: 'settings', web: 'settings' }}
        tintColor={colors.tint}
        size={18}
      />
    </Pressable>
  );
}

function InventorySettingsModal({
  visible,
  addCompletedShoppingItemsToInventory,
  colorScheme,
  onToggleAddCompletedShoppingItemsToInventory,
  onClose,
}: {
  visible: boolean;
  addCompletedShoppingItemsToInventory: boolean;
  colorScheme: 'light' | 'dark';
  onToggleAddCompletedShoppingItemsToInventory: (enabled: boolean) => void;
  onClose: () => void;
}) {
  const colors = Colors[colorScheme];

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close inventory settings"
        onPress={onClose}
        style={styles.settingsBackdrop}>
        <Pressable
          accessibilityLabel="Inventory settings panel"
          onPress={(event) => event.stopPropagation()}
          style={[
            styles.settingsSheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
            },
          ]}>
          <View style={[styles.reviewHandle, { backgroundColor: colors.line }]} />
          <View style={styles.settingsHeader}>
            <View style={styles.titleBlock}>
              <Text selectable style={[styles.settingsTitle, { color: colors.text }]}>
                Inventory settings
              </Text>
              <Text selectable style={[styles.settingsSubtitle, { color: colors.muted }]}>
                Control how shopping-list items update inventory.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close inventory settings"
              onPress={onClose}
              style={({ pressed }) => [
                styles.reviewCloseButton,
                {
                  backgroundColor: colorScheme === 'dark' ? '#26312a' : '#edf2ee',
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <SymbolView
                name={{ ios: 'xmark', android: 'close', web: 'close' }}
                tintColor={colors.muted}
                size={17}
              />
            </Pressable>
          </View>
          <View
            style={[
              styles.settingsRow,
              {
                backgroundColor: colorScheme === 'dark' ? '#202720' : '#f5f7f1',
                borderColor: colors.line,
              },
            ]}>
            <View style={styles.settingsRowTextBlock}>
              <Text selectable style={[styles.settingsRowTitle, { color: colors.text }]}>
                Add checked items to inventory
              </Text>
              <Text selectable style={[styles.settingsRowCopy, { color: colors.muted }]}>
                Checked shopping-list items are saved as inventory items.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Add checked shopping-list items to inventory"
              value={addCompletedShoppingItemsToInventory}
              onValueChange={onToggleAddCompletedShoppingItemsToInventory}
              trackColor={{
                false: colorScheme === 'dark' ? '#303a34' : '#d9e1d9',
                true: colorScheme === 'dark' ? '#4a7659' : '#8fc7a5',
              }}
              thumbColor={
                addCompletedShoppingItemsToInventory
                  ? colors.tint
                  : colorScheme === 'dark'
                    ? '#a4aea7'
                    : '#ffffff'
              }
              ios_backgroundColor={colorScheme === 'dark' ? '#303a34' : '#d9e1d9'}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function InventoryScanReviewModal({
  visible,
  items,
  selectedCount,
  colorScheme,
  onToggle,
  onAcceptSelected,
  onAcceptAll,
  onClose,
}: {
  visible: boolean;
  items: PendingInventoryScanItem[];
  selectedCount: number;
  colorScheme: 'light' | 'dark';
  onToggle: (id: string) => void;
  onAcceptSelected: () => void;
  onAcceptAll: () => void;
  onClose: () => void;
}) {
  const colors = Colors[colorScheme];

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.reviewBackdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close inventory review"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            styles.reviewSheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
              boxShadow:
                colorScheme === 'dark'
                  ? '0 -12px 34px rgba(0,0,0,0.5)'
                  : '0 -12px 34px rgba(22,42,33,0.16)',
            },
          ]}>
          <View style={[styles.reviewHandle, { backgroundColor: colors.line }]} />
          <View style={styles.reviewHeader}>
            <View style={styles.reviewTitleBlock}>
              <Text selectable style={[styles.reviewTitle, { color: colors.text }]}>
                Review inventory
              </Text>
              <Text selectable style={[styles.reviewSubtitle, { color: colors.muted }]}>
                {items.length} detected, {selectedCount} selected
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close inventory review"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [
                styles.reviewCloseButton,
                {
                  backgroundColor: colorScheme === 'dark' ? '#26312a' : '#edf1ea',
                  opacity: pressed ? 0.65 : 1,
                },
              ]}>
              <SymbolView
                name={{ ios: 'xmark', android: 'close', web: 'close' }}
                tintColor={colors.muted}
                size={17}
              />
            </Pressable>
          </View>

          <ScrollView
            style={styles.reviewList}
            contentContainerStyle={styles.reviewListContent}
            showsVerticalScrollIndicator={false}>
            {items.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.selected }}
                accessibilityLabel={`Add ${item.text}`}
                onPress={() => onToggle(item.id)}
                style={({ pressed }) => [
                  styles.reviewItem,
                  {
                    backgroundColor: item.selected
                      ? colorScheme === 'dark'
                        ? '#243129'
                        : '#e8f2eb'
                      : colorScheme === 'dark'
                        ? '#202720'
                        : '#f4f6f1',
                    borderColor: item.selected ? colors.tint : colors.line,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}>
                <View
                  style={[
                    styles.reviewCheckbox,
                    {
                      backgroundColor: item.selected ? colors.tint : 'transparent',
                      borderColor: item.selected ? colors.tint : colors.muted,
                    },
                  ]}>
                  {item.selected ? (
                    <SymbolView
                      name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                      tintColor={colorScheme === 'dark' ? '#102015' : '#ffffff'}
                      size={12}
                    />
                  ) : null}
                </View>
                <View style={styles.reviewItemTextBlock}>
                  <Text
                    selectable
                    style={[styles.reviewItemText, { color: colors.text }]}
                    numberOfLines={2}>
                    {item.text}
                  </Text>
                  {item.storage ? (
                    <Text
                      selectable
                      style={[styles.reviewItemMeta, { color: colors.muted }]}
                      numberOfLines={1}>
                      {item.storage}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.reviewActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add all detected inventory items"
              onPress={onAcceptAll}
              style={({ pressed }) => [
                styles.reviewSecondaryButton,
                {
                  backgroundColor: colorScheme === 'dark' ? '#26312a' : '#edf1ea',
                  opacity: pressed ? 0.72 : 1,
                },
              ]}>
              <Text selectable style={[styles.reviewSecondaryButtonText, { color: colors.text }]}>
                Add all
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add selected inventory items"
              disabled={selectedCount === 0}
              onPress={onAcceptSelected}
              style={({ pressed }) => [
                styles.reviewPrimaryButton,
                {
                  backgroundColor:
                    selectedCount > 0 ? colors.tint : colorScheme === 'dark' ? '#26312a' : '#e4ebe5',
                  opacity: pressed && selectedCount > 0 ? 0.72 : 1,
                },
              ]}>
              <Text
                selectable
                style={[
                  styles.reviewPrimaryButtonText,
                  {
                    color:
                      selectedCount > 0
                        ? colorScheme === 'dark'
                          ? '#102015'
                          : '#ffffff'
                        : colors.muted,
                  },
                ]}>
                Add selected
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function InventoryItemCard({
  item,
  colorScheme,
  variant,
  onDelete,
}: {
  item: InventoryItem;
  colorScheme: 'light' | 'dark';
  variant: InventoryViewMode;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const colors = Colors[colorScheme];

  if (variant === 'list') {
    return (
      <View
        style={[
          styles.inventoryRow,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            boxShadow: colorScheme === 'dark' ? '0 10px 22px rgba(0,0,0,0.22)' : '0 12px 26px rgba(22,42,33,0.08)',
          },
        ]}>
        <SymbolView
          name={{ ios: 'refrigerator', android: 'kitchen', web: 'kitchen' }}
          tintColor={colors.tint}
          size={20}
        />
        <View style={styles.rowTextBlock}>
          <Text selectable style={[styles.rowText, { color: colors.text }]} numberOfLines={2}>
            {item.text}
          </Text>
          <Text selectable style={[styles.rowMeta, { color: colors.tabIconDefault }]} numberOfLines={1}>
            {formatInventoryAddedDate(item.createdAt)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${item.text}`}
          hitSlop={8}
          onPress={() => {
            void onDelete(item.id);
          }}
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

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
          boxShadow: colorScheme === 'dark' ? '0 12px 28px rgba(0,0,0,0.26)' : '0 14px 30px rgba(22,42,33,0.1)',
        },
      ]}>
      <View style={[styles.cardIconWrap, { backgroundColor: colorScheme === 'dark' ? '#26312a' : '#edf1ea' }]}>
        <SymbolView
          name={{ ios: 'refrigerator', android: 'kitchen', web: 'kitchen' }}
          tintColor={colors.tint}
          size={24}
        />
      </View>
      <Text selectable style={[styles.cardText, { color: colors.text }]} numberOfLines={3}>
        {item.text}
      </Text>
      <Text selectable style={[styles.cardMeta, { color: colors.tabIconDefault }]} numberOfLines={1}>
        {formatInventoryAddedDate(item.createdAt)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${item.text}`}
        hitSlop={8}
        onPress={() => {
          void onDelete(item.id);
        }}
        style={({ pressed }) => [
          styles.cardDeleteButton,
          {
            backgroundColor: colorScheme === 'dark' ? '#26312a' : '#edf1ea',
            opacity: pressed ? 0.65 : 1,
          },
        ]}>
        <SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} tintColor={colors.accent} size={16} />
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
  cameraButton: {
    alignItems: 'center',
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  card: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    minHeight: 148,
    padding: 14,
  },
  cardDeleteButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    position: 'absolute',
    right: 10,
    top: 10,
    width: 32,
  },
  cardIconWrap: {
    alignItems: 'center',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  cardMeta: {
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 15,
  },
  cardText: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 22,
    paddingRight: 22,
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
    paddingTop: 4,
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
    maxWidth: 390,
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
  gridItem: {
    minWidth: 0,
    paddingBottom: 12,
    paddingHorizontal: 5,
    paddingTop: 2,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 8,
  },
  headerBlock: {
    paddingBottom: 10,
    paddingTop: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    minHeight: 22,
    paddingVertical: 0,
  },
  inputDock: {
    gap: 0,
    paddingTop: 8,
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
  inventoryRow: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 66,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  itemText: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23,
  },
  list: {
    flex: 1,
  },
  listItem: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  reviewActions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 4,
  },
  reviewBackdrop: {
    backgroundColor: 'rgba(17, 21, 19, 0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  reviewCheckbox: {
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  reviewCloseButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  reviewHandle: {
    alignSelf: 'center',
    borderRadius: 2,
    height: 4,
    width: 42,
  },
  reviewHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  reviewItem: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  reviewItemMeta: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    textTransform: 'capitalize',
  },
  reviewItemText: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 21,
  },
  reviewItemTextBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  reviewList: {
    maxHeight: 310,
  },
  reviewListContent: {
    gap: 8,
  },
  reviewPrimaryButton: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  reviewPrimaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  reviewSecondaryButton: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  reviewSecondaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  reviewSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 14,
    maxHeight: '82%',
    paddingBottom: 18,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  reviewSubtitle: {
    fontSize: 14,
    lineHeight: 19,
  },
  reviewTitle: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 25,
  },
  reviewTitleBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  rowMeta: {
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 15,
  },
  rowText: {
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 23,
  },
  rowTextBlock: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  rowTextButton: {
    flex: 1,
    minWidth: 0,
  },
  screen: {
    flex: 1,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: 9,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    paddingVertical: 9,
  },
  segmentLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  segmentRow: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  settingsBackdrop: {
    backgroundColor: 'rgba(17, 21, 19, 0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  settingsButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  settingsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  settingsRow: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 14,
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  settingsRowCopy: {
    fontSize: 13,
    lineHeight: 18,
  },
  settingsRowTextBlock: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  settingsRowTitle: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 21,
  },
  settingsSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 16,
    paddingBottom: 18,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  settingsSubtitle: {
    fontSize: 14,
    lineHeight: 19,
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 25,
  },
  shoppingRow: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  subheadRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 42,
    paddingBottom: 10,
  },
  summary: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    minWidth: 0,
  },
  titleBlock: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  viewModeButton: {
    alignItems: 'center',
    borderRadius: 6,
    height: 34,
    justifyContent: 'center',
    width: 38,
  },
  viewToggle: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 2,
    padding: 3,
  },
});
