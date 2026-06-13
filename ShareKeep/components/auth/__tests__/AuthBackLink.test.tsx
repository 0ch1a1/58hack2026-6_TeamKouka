import { render, fireEvent } from '@testing-library/react-native';
import { AuthBackLink } from '../AuthBackLink';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: () => mockBack() },
}));

describe('AuthBackLink', () => {
  beforeEach(() => mockBack.mockClear());

  it('renders the back label', () => {
    const { getByText } = render(<AuthBackLink />);
    expect(getByText('戻る')).toBeTruthy();
  });

  it('calls the provided onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(<AuthBackLink onPress={onPress} />);
    fireEvent.press(getByText('戻る'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('falls back to router.back() when no onPress is given', () => {
    const { getByText } = render(<AuthBackLink />);
    fireEvent.press(getByText('戻る'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
