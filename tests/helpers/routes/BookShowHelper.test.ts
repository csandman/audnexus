jest.mock('#config/models/Book')
jest.mock('#helpers/database/papr/audible/PaprAudibleBookHelper')
jest.mock('#helpers/books/audible/StitchHelper')
jest.mock('#helpers/database/redis/RedisHelper')

import { BookDocument } from '#config/models/Book'
import BookShowHelper from '#helpers/routes/BookShowHelper'
import {
	bookWithId,
	bookWithoutProjection,
	bookWithoutProjectionUpdatedNow,
	parsedBook
} from '#tests/datasets/helpers/books'

let asin: string
let helper: BookShowHelper

beforeEach(() => {
	asin = 'B079LRSMNN'
	helper = new BookShowHelper(asin, { seedAuthors: undefined, update: undefined }, null)
	jest
		.spyOn(helper.paprHelper, 'createOrUpdate')
		.mockResolvedValue({ data: bookWithoutProjection, modified: true })
	jest
		.spyOn(helper.paprHelper, 'findOne')
		.mockResolvedValue({ data: bookWithoutProjection, modified: false })
	jest.spyOn(helper.stitchHelper, 'process').mockResolvedValue(parsedBook)
	jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(bookWithoutProjection)
	jest
		.spyOn(helper.paprHelper, 'findOneWithProjection')
		.mockResolvedValue({ data: bookWithoutProjection, modified: false })
	jest.spyOn(global, 'fetch').mockResolvedValue({
		status: 200,
		ok: true
	} as Response)
})

describe('BookShowHelper should', () => {
	test('get a book from Papr', async () => {
		await expect(helper.getBookFromPapr()).resolves.toBe(bookWithoutProjection)
	})

	test('get new book data', async () => {
		await expect(helper.getNewBookData()).resolves.toBe(parsedBook)
	})

	test('create or update a book', async () => {
		await expect(helper.createOrUpdateBook()).resolves.toStrictEqual({
			data: bookWithoutProjection,
			modified: true
		})
	})

	test('update book with timestamps returns original book', async () => {
		helper.originalBook = bookWithoutProjection
		await expect(helper.updateBookTimestamps()).resolves.toBe(bookWithoutProjection)
	})

	test('update book without timestamps returns updated book', async () => {
		helper.originalBook = bookWithId() as BookDocument
		jest
			.spyOn(helper.paprHelper, 'update')
			.mockResolvedValue({ data: bookWithoutProjection, modified: true })
		await expect(helper.updateBookTimestamps()).resolves.toBe(bookWithoutProjection)
	})

	test('returns original book if it was updated recently when trying to update', async () => {
		helper.originalBook = bookWithoutProjectionUpdatedNow
		await expect(helper.updateActions()).resolves.toBe(bookWithoutProjectionUpdatedNow)
	})

	test('isUpdatedRecently returns false if no originalBook is present', () => {
		expect(helper.isUpdatedRecently()).toBe(false)
	})

	test('run all update actions', async () => {
		helper.originalBook = bookWithoutProjection
		await expect(helper.updateActions()).resolves.toBe(bookWithoutProjection)
	})

	test('run handler for a new book', async () => {
		jest.spyOn(helper.paprHelper, 'findOne').mockResolvedValue({ data: null, modified: false })
		await expect(helper.handler()).resolves.toBe(bookWithoutProjection)
	})

	test('run handler and update an existing book', async () => {
		helper = new BookShowHelper(asin, { seedAuthors: undefined, update: '1' }, null)
		jest
			.spyOn(helper.paprHelper, 'createOrUpdate')
			.mockResolvedValue({ data: bookWithoutProjection, modified: true })
		jest
			.spyOn(helper.paprHelper, 'findOne')
			.mockResolvedValue({ data: bookWithoutProjection, modified: false })
		jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(bookWithoutProjection)
		await expect(helper.handler()).resolves.toBe(bookWithoutProjection)
	})

	test('run handler for an existing book', async () => {
		jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(undefined)
		await expect(helper.handler()).resolves.toBe(bookWithoutProjection)
	})

	test('run handler for an existing book in redis', async () => {
		await expect(helper.handler()).resolves.toBe(bookWithoutProjection)
	})
})

describe('BookShowHelper should throw an error when', () => {
	test('adding timestamps to a book fails', async () => {
		helper.originalBook = bookWithId() as BookDocument
		jest
			.spyOn(helper.paprHelper, 'update')
			.mockRejectedValue(
				new Error(`An error occurred while adding timestamps to book ${asin} in the DB`)
			)
		await expect(helper.updateBookTimestamps()).rejects.toThrowError(
			`An error occurred while adding timestamps to book ${asin} in the DB`
		)
	})
})
