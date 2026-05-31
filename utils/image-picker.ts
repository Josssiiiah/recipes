import * as ImagePicker from 'expo-image-picker';
import { requireOptionalNativeModule } from 'expo-modules-core';

export async function loadImagePicker(): Promise<typeof ImagePicker> {
  const nativeImagePicker = requireOptionalNativeModule('ExponentImagePicker');

  if (!nativeImagePicker) {
    throw new Error(
      'Image capture needs the dev client rebuilt with expo-image-picker before it can capture images.',
    );
  }

  if (
    typeof ImagePicker.launchImageLibraryAsync !== 'function' ||
    typeof ImagePicker.launchCameraAsync !== 'function'
  ) {
    throw new Error('expo-image-picker did not expose the expected image capture APIs.');
  }

  return ImagePicker;
}

export function getImageMimeType(mimeType?: string, uri?: string) {
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
