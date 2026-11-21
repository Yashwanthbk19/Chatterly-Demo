import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/pages/ChatListPage.jsx', import.meta.url),
  'utf8'
).replaceAll('\r\n', '\n');

const sourceSection = (startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
};

test('empty group info does not render media grid placeholders', () => {
  const groupMediaSection = sourceSection(
    '<h3 className="truncate text-[12px] font-bold text-[#172033]">Media, Docs and Links</h3>',
    '<h3 className="truncate text-[12px] font-bold text-[#172033]">Members</h3>'
  );

  assert.match(groupMediaSection, /mediaPreviewItems\.length/);
  assert.match(groupMediaSection, /No media, documents, or links shared yet\./);
  assert.doesNotMatch(groupMediaSection, /empty-media-/);
});

test('a successfully reported group is visibly marked and cannot be submitted again', () => {
  const openReportFlow = sourceSection(
    '  const openChatReportFlowForContact = useCallback((targetContact) => {',
    '  const openChatReportFlow = useCallback(() => {'
  );
  const submitReportFlow = sourceSection(
    '  const handleSubmitCurrentChatReport = async () => {',
    '  const handleStartChatSelection = () => {'
  );

  assert.match(openReportFlow, /reportedContactIds\.has\(reportTargetId\)/);
  assert.match(openReportFlow, /This group has already been reported\./);
  assert.ok(
    submitReportFlow.indexOf('reportedContactIds.has(reportTargetId)') <
      submitReportFlow.indexOf('await reportGroup({'),
    'The duplicate-report guard must run before the report request.'
  );
  assert.match(source, /title: isReported \? 'Group Reported' : 'Report Group'/);
  assert.match(source, /disabled=\{isSelectedContactReported\}/);
  assert.match(source, /isReported=\{isSelectedContactReported\}/);
});
