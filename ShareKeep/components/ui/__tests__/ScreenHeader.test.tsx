import { render, fireEvent } from '@testing-library/react-native';
import { ScreenHeader } from '../ScreenHeader';

// expo-router's `router` is a native-backed singleton; mock it for the default back handler.
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: () => mockBack() },
}));

describe('ScreenHeader', () => {
  beforeEach(() => mockBack.mockClear());

  it('renders the title', () => {
    const { getByText } = render(<ScreenHeader title="受け取り" />);
    expect(getByText('受け取り')).toBeTruthy();
  });

  it('calls the provided onBack when the back button is pressed', () => {
    const onBack = jest.fn();
    const { UNSAFE_getByType } = render(<ScreenHeader title="受け取り" onBack={onBack} />);
    const { TouchableOpacity } = require('react-native');
    fireEvent.press(UNSAFE_getByType(TouchableOpacity));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('falls back to router.back() when no onBack is given', () => {
    const { UNSAFE_getByType } = render(<ScreenHeader title="受け取り" />);
    const { TouchableOpacity } = require('react-native');
    fireEvent.press(UNSAFE_getByType(TouchableOpacity));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
