import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findMessageSheetGroupParent } from '../messageSheet'

const Sheet = () => null
const Group = () => null
const node = (type: any, children?: any) => ({ type, props: { children } })

test('ignores misplaced plugin groups outside the actual sheet', () => {
	const sheet = node(Sheet, [node(Group), node(Group)])
	const root = node({}, [node(Group), node({}, node(Group)), sheet])
	assert.equal(findMessageSheetGroupParent(root, Sheet, Group), sheet)
})

test('finds a single group under providers inside an unnamed sheet', () => {
	const holder = node({}, node(Group))
	const root = node({}, node(Sheet, node({}, holder)))
	assert.equal(findMessageSheetGroupParent(root, Sheet, Group), holder)
})

test('does not fall back to the root when the sheet or group is missing', () => {
	assert.equal(findMessageSheetGroupParent(node({}, node(Group)), Sheet, Group), undefined)
	assert.equal(findMessageSheetGroupParent(node(Sheet, node({})), Sheet, Group), undefined)
	assert.equal(findMessageSheetGroupParent(node(Sheet, node(undefined)), Sheet, undefined), undefined)
})

test('multiple insertions remain inside the same sheet', () => {
	const sheet = node(Sheet, [node(Group)])
	const root = node({}, sheet)
	const first = findMessageSheetGroupParent(root, Sheet, Group)
	first.props.children.unshift(node(Group))
	const second = findMessageSheetGroupParent(root, Sheet, Group)
	second.props.children.unshift(node({}, node(Group)))
	assert.equal(first, sheet)
	assert.equal(second, sheet)
	assert.equal(root.props.children, sheet)
	assert.equal(sheet.props.children.length, 3)
})
