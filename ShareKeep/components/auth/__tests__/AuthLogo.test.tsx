import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AuthLogo } from '../AuthLogo';

describe('AuthLogo', () => {
  it('renders the ShareKeep wordmark', () => {
    const { getByText } = render(<AuthLogo />);
    expect(getByText(/ShareKeep/)).toBeTruthy();
  });

  it('uses the large font size by default', () => {
    const { getByText } = render(<AuthLogo />);
    const styles = getByText(/ShareKeep/).props.style;
    const flat = Array.isArray(styles) ? Object.assign({}, ...styles.filter(Boolean)) : styles;
    expect(flat.fontSize).toBe(36);
  });

  it('uses the smaller font size when size="md"', () => {
    const { getByText } = render(<AuthLogo size="md" />);
    const styles = getByText(/ShareKeep/).props.style;
    const flat = Array.isArray(styles) ? Object.assign({}, ...styles.filter(Boolean)) : styles;
    expect(flat.fontSize).toBe(28);
  });
});
