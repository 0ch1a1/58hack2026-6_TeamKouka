import { render, fireEvent } from '@testing-library/react-native';
import { AuthFooterLink } from '../AuthFooterLink';

describe('AuthFooterLink', () => {
  it('renders the prompt and link label', () => {
    const { getByText } = render(
      <AuthFooterLink prompt="アカウントをお持ちでない方は" linkLabel="新規登録" onPress={() => {}} />,
    );
    expect(getByText('アカウントをお持ちでない方は')).toBeTruthy();
    expect(getByText('新規登録')).toBeTruthy();
  });

  it('fires onPress when the link is pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <AuthFooterLink prompt="x" linkLabel="新規登録" onPress={onPress} />,
    );
    fireEvent.press(getByText('新規登録'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
