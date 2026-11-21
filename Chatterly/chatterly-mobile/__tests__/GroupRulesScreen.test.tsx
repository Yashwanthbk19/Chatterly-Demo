import React from 'react';
import { Alert } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { GroupRulesScreen } from '../src/screens/GroupRulesScreen';
import { sendGroupTimelineNotice, updateGroupRules } from '../src/services/groupApi';
jest.mock('react-native-safe-area-context', () => ({...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
jest.mock('../src/services/groupApi', () => ({ updateGroupRules: jest.fn(), sendGroupTimelineNotice: jest.fn() }));
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(sendGroupTimelineNotice).mockResolvedValue({id: 'rules-notice', text: 'Group rules updated.', createdAt: '2026-10-16T10:00:00Z', isOwn: true, systemEvent: true, messageType: 'text'});
});
test('adds, edits, removes and reorders rules before persisting', async () => {
  const onTimelineMessage = jest.fn();
  const onSaved = jest.fn();
  const onBack = jest.fn();
  jest.mocked(updateGroupRules).mockResolvedValueOnce();
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <GroupRulesScreen
        groupId="g1"
        rules={['First', 'Second']}
        onSaved={onSaved}
        onTimelineMessage={onTimelineMessage}
        onBack={onBack}
      />,
    );
  });
  const control = (label: string) =>
    tree!.root.findAllByProps({ accessibilityLabel: label })[0];
  await act(async () => control('Add new rule').props.onPress());
  await act(async () => control('Rule 3').props.onChangeText('24 hour notice'));
  await act(async () => control('Move rule 3 up').props.onPress());
  await act(async () => control('Remove rule 1').props.onPress());
  await act(async () => control('Save Group Rules').props.onPress());
  expect(updateGroupRules).toHaveBeenCalledWith('g1', [
    '24 hour notice',
    'Second',
  ]);
  expect(sendGroupTimelineNotice).toHaveBeenCalledWith('g1', 'Group rules updated.');
  expect(onTimelineMessage).toHaveBeenCalledWith(expect.objectContaining({id: 'rules-notice'}));
  expect(onSaved).toHaveBeenCalledWith(['24 hour notice', 'Second']);
  expect(onBack).toHaveBeenCalled();
  await act(async () => tree!.unmount());
});
test('keeps edits on screen when the backend rejects a save', async () => {
  jest
    .mocked(updateGroupRules)
    .mockRejectedValueOnce(new Error('Access denied'));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const onBack = jest.fn();
  const onSaved = jest.fn();
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <GroupRulesScreen
        groupId="g1"
        rules={['First']}
        onSaved={onSaved}
        onBack={onBack}
      />,
    );
  });
  await act(async () =>
    tree!.root
      .findAllByProps({ accessibilityLabel: 'Rule 1' })[0]
      .props.onChangeText('Changed'),
  );
  await act(async () =>
    tree!.root
      .findAllByProps({ accessibilityLabel: 'Save Group Rules' })[0]
      .props.onPress(),
  );
  expect(sendGroupTimelineNotice).not.toHaveBeenCalled();
  expect(onBack).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith('Unable to save rules', 'Access denied');
  await act(async () => tree!.unmount());
  alert.mockRestore();
});
test('limits rule text, including pasted text, and shows the counter warning state', async () => {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <GroupRulesScreen
        groupId="g1"
        rules={['Existing']}
        onSaved={jest.fn()}
        onBack={jest.fn()}
      />,
    );
  });
  const input = tree!.root.findAllByProps({ accessibilityLabel: 'Rule 1' })[0];
  const renderedText = () => JSON.stringify(tree!.toJSON());
  expect(input.props.maxLength).toBe(150);
  expect(renderedText()).toContain('"8","/","150"');
  await act(async () => input.props.onChangeText('a'.repeat(135)));
  expect(input.props.value).toHaveLength(135);
  expect(renderedText()).toContain('"135","/","150"');
  expect(renderedText()).toContain('Approaching character limit');
  await act(async () => input.props.onChangeText('b'.repeat(200)));
  expect(input.props.value).toHaveLength(150);
  expect(renderedText()).toContain('"150","/","150"');
  expect(renderedText()).toContain('Character limit reached');
  await act(async () => tree!.unmount());
});


test('retries a failed rules notification without saving the rules twice', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(updateGroupRules).mockResolvedValue();
  jest.mocked(sendGroupTimelineNotice).mockRejectedValueOnce(new Error('Offline'));
  const onBack = jest.fn();
  const onSaved = jest.fn();
  const onTimelineMessage = jest.fn();
  let tree: renderer.ReactTestRenderer;
  await act(async () => {tree = renderer.create(<GroupRulesScreen groupId="g1" rules={['First']} onBack={onBack} onSaved={onSaved} onTimelineMessage={onTimelineMessage}/>);});
  const control = (label: string) => tree!.root.findAllByProps({accessibilityLabel: label})[0];
  await act(async () => control('Rule 1').props.onChangeText('Changed'));
  await act(async () => control('Save Group Rules').props.onPress());
  expect(onBack).not.toHaveBeenCalled();
  expect(onTimelineMessage).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith('Rules saved, notification failed', expect.any(String));
  await act(async () => control('Save Group Rules').props.onPress());
  expect(updateGroupRules).toHaveBeenCalledTimes(1);
  expect(sendGroupTimelineNotice).toHaveBeenCalledTimes(2);
  expect(onTimelineMessage).toHaveBeenCalledTimes(1);
  expect(onSaved).toHaveBeenCalledWith(['Changed']);
  expect(onBack).toHaveBeenCalledTimes(1);
  await act(async () => tree!.unmount());
  alert.mockRestore();
});

test('closing unchanged rules creates no notification', async () => {
  const onBack = jest.fn();
  let tree: renderer.ReactTestRenderer;
  await act(async () => {tree = renderer.create(<GroupRulesScreen groupId="g1" rules={['First']} onBack={onBack} onSaved={jest.fn()}/>);});
  await act(async () => tree!.root.findAllByProps({accessibilityLabel: 'Back from rules'})[0].props.onPress());
  expect(updateGroupRules).not.toHaveBeenCalled();
  expect(sendGroupTimelineNotice).not.toHaveBeenCalled();
  expect(onBack).toHaveBeenCalledTimes(1);
  await act(async () => tree!.unmount());
});
