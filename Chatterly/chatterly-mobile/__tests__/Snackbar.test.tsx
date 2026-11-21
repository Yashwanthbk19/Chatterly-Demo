import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Snackbar} from '../src/components/Snackbar';

test('a host re-rendering with a new onHide does not restart the hide timer', () => {
  jest.useFakeTimers();
  const hidden = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Snackbar message="User is offline" onHide={() => hidden()} />);
  });
  // A call screen re-renders every second with a fresh inline callback.
  for (let second = 0; second < 3; second += 1) {
    ReactTestRenderer.act(() => {
      jest.advanceTimersByTime(1000);
      renderer.update(<Snackbar message="User is offline" onHide={() => hidden()} />);
    });
  }
  ReactTestRenderer.act(() => { jest.advanceTimersByTime(600); });
  expect(hidden).toHaveBeenCalledTimes(1);
  ReactTestRenderer.act(() => renderer.unmount());
  jest.useRealTimers();
});

test('inline placement leaves positioning to the host', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Snackbar floating={false} message="Calling…" onHide={jest.fn()} />);
  });
  const bar = renderer.root.findByProps({accessibilityLiveRegion: 'polite'});
  const style = Object.assign({}, ...[bar.props.style].flat(3).filter(Boolean));
  expect(style.position).toBeUndefined();
  ReactTestRenderer.act(() => renderer.unmount());
});

test('floating notices clear the supplied bottom system inset', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Snackbar bottomInset={24} message="Member added" onHide={jest.fn()} />);
  });
  const bar = renderer.root.findByProps({accessibilityLiveRegion: 'polite'});
  const style = Object.assign({}, ...[bar.props.style].flat(3).filter(Boolean));
  expect(style.bottom + style.marginBottom).toBe(36);
  expect(bar.props.mode).toBe('margin');
  expect(bar.props.edges).toEqual({bottom: 'maximum', left: 'additive', right: 'additive'});
  expect(bar.props.pointerEvents).toBe('none');
  ReactTestRenderer.act(() => renderer.unmount());
});

test('default floating notices respect native window insets without blocking touches', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Snackbar message="Member removed" onHide={jest.fn()} />);
  });
  const bar = renderer.root.findByProps({accessibilityLiveRegion: 'polite'});
  const style = Object.assign({}, ...[bar.props.style].flat(3).filter(Boolean));
  expect(bar.props.mode).toBe('margin');
  expect(bar.props.edges).toEqual({bottom: 'maximum', left: 'additive', right: 'additive'});
  expect(style.bottom + style.marginBottom).toBe(18);
  expect(bar.props.pointerEvents).toBe('none');
  ReactTestRenderer.act(() => renderer.unmount());
});
