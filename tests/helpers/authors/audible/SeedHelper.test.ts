import SeedHelper from '#helpers/authors/audible/SeedHelper'
import { parsedBook } from '#tests/datasets/helpers/books'

let helper: SeedHelper

beforeEach(() => {
	// Set up helpers
	helper = new SeedHelper(parsedBook)
})

afterEach(() => {
	// Reset mocks
	jest.resetAllMocks()
	jest.restoreAllMocks()
})

describe('SeedHelper should', () => {
	test('setup constructor correctly', () => {
		expect(helper.book).toBe(parsedBook)
	})

	test('seed all', async () => {
		// Mock Fetch
		global.fetch = jest.fn().mockImplementation(() =>
			Promise.resolve({
				status: 200,
				ok: true
			})
		)
		const seedAll = await helper.seedAll()
		expect(seedAll).toEqual([true, true])
		expect(fetch).toHaveBeenCalledTimes(2)
	})

	test('log error if http error', async () => {
		// Mock Fetch
		global.fetch = jest.fn().mockImplementation(() =>
			Promise.reject({
				status: 400,
				ok: false
			})
		)
		await expect(helper.seedAll()).resolves.toBeUndefined()
	})

	test('return false if no author asin', async () => {
		helper.book.authors = []
		await expect(helper.seedAll()).resolves.toEqual([])
	})
})
