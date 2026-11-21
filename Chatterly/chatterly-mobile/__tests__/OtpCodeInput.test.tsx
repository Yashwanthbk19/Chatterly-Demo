import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {StyleSheet, Text} from 'react-native';
import {OtpCodeInput} from '../src/components/OtpCodeInput';
import {OTP_LENGTH} from '../src/constants/otp';

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

function renderField(onChange: (code: string) => void = jest.fn()) {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<OtpCodeInput onChange={onChange} value="" />);
  });
  mounted.push(renderer!);
  return renderer!.root.findAllByProps({accessibilityLabel: '6 digit verification code'})[0];
}

const paste = (field: ReactTestRenderer.ReactTestInstance, text: string) => {
  ReactTestRenderer.act(() => { field.props.onChangeText(text); });
};

afterEach(() => {
  ReactTestRenderer.act(() => { mounted.splice(0).forEach(renderer => renderer.unmount()); });
});

/**
 * maxLength is applied natively to the RAW text, before the change handler gets
 * a chance to strip separators. Capping it at OTP_LENGTH therefore truncates a
 * code pasted as "482 913" to "482 91" and silently loses the last digit, which
 * is why this guard exists rather than a test of `sanitizeOtpInput` alone.
 */
test('accepts a pasted code wide enough to carry its separators', () => {
  const field = renderField();
  expect(field.props.maxLength).toBeGreaterThan(OTP_LENGTH);
  expect(field.props.blurOnSubmit).toBe(false);
});

test('keeps all six digits of a code pasted with a space in it', () => {
  const onChange = jest.fn();
  paste(renderField(onChange), '482 913');

  expect(onChange).toHaveBeenCalledWith('482913');
});

test('keeps all six digits of a code pasted with a hyphen in it', () => {
  const onChange = jest.fn();
  paste(renderField(onChange), '482-913');

  expect(onChange).toHaveBeenCalledWith('482913');
});

test('still stops at six digits when more arrive', () => {
  const onChange = jest.fn();
  paste(renderField(onChange), '4829131234');

  expect(onChange).toHaveBeenCalledWith('482913');
});

test('shows one digit per box without exposing the aggregate native input', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<OtpCodeInput onChange={jest.fn()} value="114955" />);
  });
  mounted.push(renderer!);

  const field = renderer!.root.findByProps({accessibilityLabel: '6 digit verification code'});
  const nativeStyle = StyleSheet.flatten(field.props.style);
  const visibleDigits = renderer!.root.findAllByType(Text).map(node => node.props.children);

  expect(nativeStyle.opacity).toBeGreaterThan(0);
  expect(nativeStyle.opacity).toBeLessThan(0.1);
  expect(visibleDigits).toEqual(['1', '1', '4', '9', '5', '5']);
  expect(visibleDigits).not.toContain('114955');
});
