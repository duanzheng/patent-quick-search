import { Fragment, forwardRef } from 'react';
// The remote Fetch body is always text. Never use an HTML or Markdown renderer here.
export const ContentText = forwardRef<HTMLPreElement, {content:string; find:string}>(function ContentText({content,find},ref) {
  return <pre ref={ref} className="body-text">{find ? content.split(find).map((text,index)=><Fragment key={index}>{index>0&&<mark>{find}</mark>}{text}</Fragment>) : content}</pre>;
});
