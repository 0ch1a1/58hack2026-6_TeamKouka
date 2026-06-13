import { render, fireEvent } from '@testing-library/react-native';
import { TextInput } from 'react-native';
import { AuthTextField } from '../AuthTextField';

describe('AuthTextField', () => {
  it('passes the placeholder through to the TextInput', () => {
    const { getByPlaceholderText } = render(<AuthTextField placeholder="メールアドレス" />);
    expect(getByPlaceholderText('メールアドレス')).toBeTruthy();
  });

  it('forwards value and onChangeText', () => {
    const onChangeText = jest.fn();
    const { getByDisplayValue } = render(
      <AuthTextField value="abc" onChangeText={onChangeText} />,
    );
    const input = getByDisplayValue('abc');
    fireEvent.changeText(input, 'abcd');
    expect(onChangeText).toHaveBeenCalledWith('abcd');
  });

  it('sets a fixed placeholder text color', () => {
    const { UNSAFE_getByType } = render(<AuthTextField placeholder="x" />);
    expect(UNSAFE_getByType(TextInput).props.placeholderTextColor).toBe('#9CA3AF');
  });
});
