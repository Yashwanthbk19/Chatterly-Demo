import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {AppState, type AppStateStatus} from 'react-native';
import {activateKeepAwakeAsync, deactivateKeepAwake} from 'expo-keep-awake';
import {useCallKeepAwake} from '../src/hooks/useCallKeepAwake';
function Call({enabled}: {enabled: boolean}) { useCallKeepAwake(enabled); return null; }
test('keeps a video call awake, releases in background, reacquires on return and releases on end', async () => {
  let listener: (state: AppStateStatus) => void = () => undefined;
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { listener = callback; return {remove}; });
  const current = AppState.currentState;
  AppState.currentState = 'active';
  let tree: TestRenderer.ReactTestRenderer;
  await act(async () => { tree = TestRenderer.create(<Call enabled />); });
  const tag = (activateKeepAwakeAsync as jest.Mock).mock.calls.slice(-1)[0][0];
  await act(async () => { listener('background'); });
  expect(deactivateKeepAwake).toHaveBeenCalledWith(tag);
  await act(async () => { listener('active'); });
  expect(activateKeepAwakeAsync).toHaveBeenLastCalledWith(tag);
  await act(async () => { tree.update(<Call enabled={false} />); });
  expect(remove).toHaveBeenCalled();
  expect(deactivateKeepAwake).toHaveBeenLastCalledWith(tag);
  await act(async () => { tree.unmount(); });
  AppState.currentState = current;
  jest.restoreAllMocks();
});
