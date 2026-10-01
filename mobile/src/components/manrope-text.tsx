import { forwardRef } from 'react';
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextInputProps,
  type TextInput as NativeTextInputInstance,
  type TextProps,
} from 'react-native';

const manropeByWeight: Record<string, string> = {
  '100': 'Manrope_200ExtraLight',
  '200': 'Manrope_200ExtraLight',
  '300': 'Manrope_300Light',
  '400': 'Manrope_400Regular',
  '500': 'Manrope_500Medium',
  '600': 'Manrope_600SemiBold',
  '700': 'Manrope_700Bold',
  '800': 'Manrope_800ExtraBold',
  '900': 'Manrope_800ExtraBold',
  normal: 'Manrope_400Regular',
  bold: 'Manrope_700Bold',
};

function manropeStyle(style: TextProps['style']) {
  const flattened = StyleSheet.flatten(style) ?? {};
  const weight = String(flattened.fontWeight ?? '400');

  return {
    ...flattened,
    fontFamily: manropeByWeight[weight] ?? 'Manrope_400Regular',
    // The family already encodes the weight. Leaving fontWeight here makes iOS
    // attempt a synthetic variant instead of the bundled Manrope face.
    fontWeight: undefined,
  };
}

export function Text({ style, ...props }: TextProps) {
  return <NativeText {...props} style={manropeStyle(style)} />;
}

export const TextInput = forwardRef<NativeTextInputInstance, TextInputProps>(function ManropeTextInput({ style, ...props }, ref) {
  return <NativeTextInput ref={ref} {...props} style={manropeStyle(style)} />;
});
