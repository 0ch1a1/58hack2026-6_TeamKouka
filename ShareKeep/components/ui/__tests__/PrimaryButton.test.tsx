import { render, fireEvent } from '@testing-library/react-native';
import { ActivityIndicator } from 'react-native';
import { PrimaryButton } from '../PrimaryButton';

describe('PrimaryButton', () => {
  it('renders the label', () => {
    const { getByText } = render(<PrimaryButton label="送信" onPress={() => {}} />);
    expect(getByText('送信')).toBeTruthy();
  });

  it('fires onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(<PrimaryButton label="送信" onPress={onPress} />);
    fireEvent.press(getByText('送信'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = render(<PrimaryButton label="送信" onPress={onPress} disabled />);
    fireEvent.press(getByText('送信'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a spinner and hides the label while loading', () => {
    const { queryByText, UNSAFE_queryByType } = render(
      <PrimaryButton label="送信" onPress={() => {}} loading />,
    );
    expect(queryByText('送信')).toBeNull();
    expect(UNSAFE_queryByType(ActivityIndicator)).toBeTruthy();
  });

  it('disables the touchable while loading', () => {
    const { UNSAFE_getByType } = render(
      <PrimaryButton label="送信" onPress={() => {}} loading />,
    );
    const { TouchableOpacity } = require('react-native');
    // loading forces `disabled` on the underlying touchable.
    expect(UNSAFE_getByType(TouchableOpacity).props.disabled).toBe(true);
  });

  it('disables the touchable when disabled prop is set', () => {
    const { UNSAFE_getByType } = render(
      <PrimaryButton label="送信" onPress={() => {}} disabled />,
    );
    const { TouchableOpacity } = require('react-native');
    expect(UNSAFE_getByType(TouchableOpacity).props.disabled).toBe(true);
  });

  it('renders an icon when the icon prop is provided', () => {
    const withIcon = render(
      <PrimaryButton label="送信" onPress={() => {}} icon="checkmark" />,
    );
    const { Ionicons } = require('@expo/vector-icons');
    expect(withIcon.UNSAFE_queryByType(Ionicons)).toBeTruthy();
  });

  it('renders no icon when the icon prop is omitted', () => {
    const withoutIcon = render(<PrimaryButton label="送信" onPress={() => {}} />);
    const { Ionicons } = require('@expo/vector-icons');
    expect(withoutIcon.UNSAFE_queryByType(Ionicons)).toBeNull();
  });
});
