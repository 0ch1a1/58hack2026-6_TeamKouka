import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Card } from '../Card';

describe('Card', () => {
  it('renders its children', () => {
    const { getByText } = render(
      <Card>
        <Text>中身</Text>
      </Card>,
    );
    expect(getByText('中身')).toBeTruthy();
  });

  it('renders multiple children', () => {
    const { getByText } = render(
      <Card>
        <Text>A</Text>
        <Text>B</Text>
      </Card>,
    );
    expect(getByText('A')).toBeTruthy();
    expect(getByText('B')).toBeTruthy();
  });

  it('applies a custom style alongside the base card style', () => {
    const { UNSAFE_getByType } = render(
      <Card style={{ padding: 99 }}>
        <Text>x</Text>
      </Card>,
    );
    const { View } = require('react-native');
    const view = UNSAFE_getByType(View);
    const flattened = Array.isArray(view.props.style)
      ? Object.assign({}, ...view.props.style.filter(Boolean))
      : view.props.style;
    // base padding is 16, overridden to 99 by the custom style
    expect(flattened.padding).toBe(99);
    // base style still present
    expect(flattened.borderRadius).toBeDefined();
  });
});
