import React from 'react';
import { splitMessageTextWithLinks } from '../utils/message';

export default function MessageText({ text = '', linkClassName = '', renderText }) {
  return splitMessageTextWithLinks(text).map((segment, index) =>
    segment.type === 'link' ? (
      <a
        key={`${segment.value}-${index}`}
        href={segment.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        className={`${linkClassName} max-w-full [overflow-wrap:anywhere] [word-break:break-word]`}
      >
        {segment.value}
      </a>
    ) : (
      <React.Fragment key={`text-${index}`}>
        {renderText ? renderText(segment.value, index) : segment.value}
      </React.Fragment>
    )
  );
}
