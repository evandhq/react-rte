/* @flow */
import React, { Component } from 'react';
import {
  CompositeDecorator,
  Editor,
  EditorState,
  Modifier,
  RichUtils,
  ContentBlock,
  Entity
} from 'draft-js';
import getDefaultKeyBinding from 'draft-js/lib/getDefaultKeyBinding';
import changeBlockDepth from './lib/changeBlockDepth';
import changeBlockType from './lib/changeBlockType';
import getBlocksInSelection from './lib/getBlocksInSelection';
import insertBlockAfter from './lib/insertBlockAfter';
import isListItem from './lib/isListItem';
import isSoftNewlineEvent from 'draft-js/lib/isSoftNewlineEvent';
import EditorToolbar from './lib/EditorToolbar';
import EditorValue from './lib/EditorValue';
import LinkDecorator from './lib/LinkDecorator';
import ImageDecorator from './lib/ImageDecorator';
import cx from 'classnames';
import autobind from 'class-autobind';
import { EventEmitter } from 'events';
import { BLOCK_TYPE } from 'draft-js-utils';
import './Draft.global.css';
import styles from './RichTextEditor.css';

// $FlowIssue - Flow doesn't understand CSS Modules
// $FlowIssue - Flow doesn't understand CSS Modules

const MAX_LIST_DEPTH = 2;

// Custom overrides for "code" style.
const styleMap = {
  CODE: {
    backgroundColor: '#f3f3f3',
    fontFamily: '"Inconsolata", "Menlo", "Consolas", monospace',
    fontSize: 16,
    padding: 2,
  },
};

type ChangeHandler = (value:EditorValue) => any;

type Props = {
  className?: string;
  toolbarClassName?: string;
  editorClassName?: string;
  value: EditorValue;
  onChange?: ChangeHandler;
  placeholder?: string;
  customStyleMap?: {[style: string]: {[key: string]: any}};
  onFileChange: Function;
};

export default class RichTextEditor extends Component {
  props:Props;
  _keyEmitter:EventEmitter;

  constructor() {
    super(...arguments);
    this._keyEmitter = new EventEmitter();
    autobind(this);
  }

  render():React.Element {
    let { value, className, toolbarClassName, editorClassName, placeholder, customStyleMap, ...otherProps } = this.props;
    let editorState = value.getEditorState();
    customStyleMap = customStyleMap ? { ...styleMap, ...customStyleMap } : styleMap;

    // If the user changes block type before entering any text, we can either
    // style the placeholder or hide it. Let's just hide it for now.
    let combinedEditorClassName = cx({
      [styles.editor]: true,
      [styles.hidePlaceholder]: this._shouldHidePlaceholder(),
    }, editorClassName);
    return (
      <div className={cx(styles.root, className)}>
        <EditorToolbar
          className={toolbarClassName}
          keyEmitter={this._keyEmitter}
          editorState={editorState}
          onChange={this._onChange}
          focusEditor={this._focus}
          onFileChange={this.props.onFileChange}
        />
        <div className={combinedEditorClassName}>
          <Editor
            {...otherProps}
            blockStyleFn={getBlockStyle}
            customStyleMap={customStyleMap}
            editorState={editorState}
            handleReturn={this._handleReturn}
            keyBindingFn={this._customKeyHandler}
            handleKeyCommand={this._handleKeyCommand}
            onTab={this._onTab}
            onChange={this._onChange}
            placeholder={placeholder}
            ref="editor"
            spellCheck={true}
          />
        </div>
      </div>
    );
  }

  _shouldHidePlaceholder():boolean {
    let editorState = this.props.value.getEditorState();
    let contentState = editorState.getCurrentContent();
    if (!contentState.hasText()) {
      if (contentState.getBlockMap().first().getType() !== 'unstyled') {
        return true;
      }
    }
    return false;
  }

  _handleReturn(event:Object):boolean {
    if (this._handleReturnSoftNewline(event)) {
      return true;
    }
    if (this._handleReturnEmptyListItem()) {
      return true;
    }
    if (this._handleReturnSpecialBlock()) {
      return true;
    }
    return false;
  }

  // `shift + return` should insert a soft newline.
  _handleReturnSoftNewline(event:Object):boolean {
    let editorState = this.props.value.getEditorState();
    if (isSoftNewlineEvent(event)) {
      let selection = editorState.getSelection();
      if (selection.isCollapsed()) {
        this._onChange(RichUtils.insertSoftNewline(editorState));
      } else {
        let content = editorState.getCurrentContent();
        let newContent = Modifier.removeRange(content, selection, 'forward');
        let newSelection = newContent.getSelectionAfter();
        let block = newContent.getBlockForKey(newSelection.getStartKey());
        newContent = Modifier.insertText(
          newContent,
          newSelection,
          '\n',
          block.getInlineStyleAt(newSelection.getStartOffset()),
          null,
        );
        this._onChange(
          EditorState.push(editorState, newContent, 'insert-fragment')
        );
      }
      return true;
    }
    return false;
  }

  // If the cursor is in an empty list item when return is pressed, then the
  // block type should change to normal (end the list).
  _handleReturnEmptyListItem():boolean {
    let editorState = this.props.value.getEditorState();
    let selection = editorState.getSelection();
    if (selection.isCollapsed()) {
      let contentState = editorState.getCurrentContent();
      let blockKey = selection.getStartKey();
      let block = contentState.getBlockForKey(blockKey);
      if (isListItem(block) && block.getLength() === 0) {
        let depth = block.getDepth();
        let newState = (depth === 0) ?
          changeBlockType(editorState, blockKey, BLOCK_TYPE.UNSTYLED) :
          changeBlockDepth(editorState, blockKey, depth - 1);
        this._onChange(newState);
        return true;
      }
    }
    return false;
  }

  // If the cursor is at the end of a special block (any block type other than
  // normal or list item) when return is pressed, new block should be normal.
  _handleReturnSpecialBlock():boolean {
    let editorState = this.props.value.getEditorState();
    let selection = editorState.getSelection();
    if (selection.isCollapsed()) {
      let contentState = editorState.getCurrentContent();
      let blockKey = selection.getStartKey();
      let block = contentState.getBlockForKey(blockKey);
      if (!isListItem(block) && block.getType() !== BLOCK_TYPE.UNSTYLED) {
        // If cursor is at end.
        if (block.getLength() === selection.getStartOffset()) {
          let newEditorState = insertBlockAfter(
            editorState,
            blockKey,
            BLOCK_TYPE.UNSTYLED
          );
          this._onChange(newEditorState);
          return true;
        }
      }
    }
    return false;
  }

  _onTab(event:Object):?string {
    let editorState = this.props.value.getEditorState();
    let newEditorState = RichUtils.onTab(event, editorState, MAX_LIST_DEPTH);
    if (newEditorState !== editorState) {
      this._onChange(newEditorState);
    }
  }

  _customKeyHandler(event:Object):?string {
    // Allow toolbar to catch key combinations.
    let eventFlags = {};
    this._keyEmitter.emit('keypress', event, eventFlags);
    if (eventFlags.wasHandled) {
      return null;
    } else {
      return getDefaultKeyBinding(event);
    }
  }

  _handleKeyCommand(command:string):boolean {
    let editorState = this.props.value.getEditorState();
    let newEditorState = RichUtils.handleKeyCommand(editorState, command);
    if (newEditorState) {
      this._onChange(newEditorState);
      return true;
    } else {
      return false;
    }
  }

  _onChange(editorState:EditorState) {
    let { onChange, value } = this.props;
    if (onChange == null) {
      return;
    }
    let newValue = value.setEditorState(editorState);
    let newEditorState = newValue.getEditorState();
    this._handleInlineImageSelection(newEditorState);
    onChange(newValue);
  }

  _handleInlineImageSelection(editorState:EditorState) {
    let selection = editorState.getSelection();
    let blocks = getBlocksInSelection(editorState);

    const selectImage = (block, offset) => {
      const imageKey = block.getEntityAt(offset);
      Entity.mergeData(imageKey, { selected: true });
    };

    let isInMiddleBlock = (index) => index > 0 && index < blocks.size - 1;
    let isWithinStartBlockSelection = (offset, index) => (
      index === 0 && offset > selection.getStartOffset()
    );
    let isWithinEndBlockSelection = (offset, index) => (
      index === blocks.size - 1 && offset < selection.getEndOffset()
    );

    blocks.toIndexedSeq().forEach((block, index) => {
      ImageDecorator.strategy(
        block,
        (offset) => {
          if (isWithinStartBlockSelection(offset, index) ||
            isInMiddleBlock(index) ||
            isWithinEndBlockSelection(offset, index)) {
            selectImage(block, offset);
          }
        });
    });
  }

  _focus() {
    this.refs.editor.focus();
  }
}

function getBlockStyle(block:ContentBlock):string {
  let result = styles.block;
  switch (block.getType()) {
    case 'unstyled':
      return cx(result, styles.paragraph);
    case 'blockquote':
      return cx(result, styles.blockquote);
    case 'code-block':
      return cx(result, styles.codeBlock);
    default:
      return result;
  }
}

const decorator = new CompositeDecorator([LinkDecorator, ImageDecorator]);

function createEmptyValue():EditorValue {
  return EditorValue.createEmpty(decorator);
}

function createValueFromString(markup:string, format:string):EditorValue {
  return EditorValue.createFromString(markup, format, decorator);
}

// $FlowIssue - This should probably not be done this way.
Object.assign(RichTextEditor, {
  EditorValue,
  decorator,
  createEmptyValue,
  createValueFromString,
});

export { EditorValue, decorator, createEmptyValue, createValueFromString };
