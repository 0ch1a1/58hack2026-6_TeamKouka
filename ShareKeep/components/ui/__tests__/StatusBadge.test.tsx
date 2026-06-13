import { render } from '@testing-library/react-native';
import { StatusBadge } from '../StatusBadge';

describe('StatusBadge', () => {
  it('renders the label', () => {
    const { getByText } = render(
      <StatusBadge label="保管中" color="#000" bg="#eee" />,
    );
    expect(getByText('保管中')).toBeTruthy();
  });

  it('applies the text color and background color from props', () => {
    const { getByText, UNSAFE_getByType } = render(
      <StatusBadge label="完了" color="#1A7A4C" bg="#D1FAE5" />,
    );
    const { View } = require('react-native');
    const badge = UNSAFE_getByType(View);
    const badgeStyle = Array.isArray(badge.props.style)
      ? Object.assign({}, ...badge.props.style.filter(Boolean))
      : badge.props.style;
    expect(badgeStyle.backgroundColor).toBe('#D1FAE5');

    const text = getByText('完了');
    const textStyle = Array.isArray(text.props.style)
      ? Object.assign({}, ...text.props.style.filter(Boolean))
      : text.props.style;
    expect(textStyle.color).toBe('#1A7A4C');
  });

  it('renders an icon when provided', () => {
    const { UNSAFE_queryByType } = render(
      <StatusBadge label="完了" color="#000" bg="#eee" icon="checkmark-circle" />,
    );
    const { Ionicons } = require('@expo/vector-icons');
    expect(UNSAFE_queryByType(Ionicons)).toBeTruthy();
  });

  it('renders no icon when omitted', () => {
    const { UNSAFE_queryByType } = render(
      <StatusBadge label="完了" color="#000" bg="#eee" />,
    );
    const { Ionicons } = require('@expo/vector-icons');
    expect(UNSAFE_queryByType(Ionicons)).toBeNull();
  });
});
