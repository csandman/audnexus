import type { CheerioAPI } from 'cheerio'

import { AudibleProduct } from '#config/typing/audible'
import { ApiBook, Book, HtmlBook } from '#config/typing/books'
import { isBook } from '#config/typing/checkers'
import ApiHelper from '#helpers/books/audible/ApiHelper'
import ScrapeHelper from '#helpers/books/audible/ScrapeHelper'
import getErrorMessage from '#helpers/utils/getErrorMessage'
import SharedHelper from '#helpers/utils/shared'
import { ErrorMessageSort, NoticeChaptersFallback } from '#static/messages'

class StitchHelper {
	apiHelper: ApiHelper
	apiParsed!: ApiBook
	apiResponse!: AudibleProduct
	asin: string
	sharedHelper: SharedHelper
	scrapeHelper: ScrapeHelper
	scraperParsed: HtmlBook | undefined
	scraperResponse: CheerioAPI | undefined

	constructor(asin: string, region: string) {
		this.asin = asin
		// Set up helpers
		this.apiHelper = new ApiHelper(asin, region)
		this.sharedHelper = new SharedHelper()
		this.scrapeHelper = new ScrapeHelper(asin, region)
	}

	/**
	 * Fetch book from API and assign to class
	 */
	async fetchApiBook() {
		const apiResponse = this.apiHelper.fetchBook()
		try {
			this.apiResponse = await apiResponse
			// Set the helper data
			this.apiHelper.inputJson = this.apiResponse.product
		} catch (error) {
			throw new Error(getErrorMessage(error))
		}
	}

	/**
	 * Fetch book from scraper and assign to class
	 */
	async fetchScraperBook() {
		const scraperResponse = this.scrapeHelper.fetchBook()
		try {
			this.scraperResponse = await scraperResponse
		} catch (error) {
			throw new Error(getErrorMessage(error))
		}
	}

	/**
	 * Parse API response and assign to class
	 */
	async parseApiResponse() {
		const apiParsed = this.apiHelper.parseResponse(this.apiResponse)
		try {
			this.apiParsed = await apiParsed
		} catch (error) {
			throw new Error(getErrorMessage(error))
		}
	}

	/**
	 * Parse scraper response and assign to class
	 */
	async parseScraperResponse() {
		const scraperParsed = this.scrapeHelper.parseResponse(this.scraperResponse)
		try {
			this.scraperParsed = await scraperParsed
		} catch (error) {
			throw new Error(getErrorMessage(error))
		}
	}

	/**
	 * Sets genres key in returned json if it exists
	 */
	async includeGenres(): Promise<Book> {
		if (this.scraperParsed?.genres?.length) {
			const sortedObject = this.sharedHelper.sortObjectByKeys({
				...this.apiParsed,
				...this.scraperParsed
			})
			if (isBook(sortedObject)) return sortedObject
			throw new Error(ErrorMessageSort(this.asin))
		}
		return this.apiParsed as Book
	}

	/**
	 * Call fetch and parse functions only as necessary
	 * (prefer API over scraper).
	 * Returns the result of includeGenres()
	 * @returns {Promise<Book>}
	 */
	async process(): Promise<Book> {
		// First, we want to see if we can get all the data from the API
		await this.fetchApiBook()
		// Make sure we have a valid response
		const requiredKeys = this.apiHelper.hasRequiredKeys()
		if (!requiredKeys.isValid) {
			throw new Error(requiredKeys.message)
		}
		await this.parseApiResponse()

		// Check if we need to scrape for genres
		if (!this.apiResponse.product.category_ladders.length) {
			console.debug(NoticeChaptersFallback(this.asin))
			await this.fetchScraperBook()
			await this.parseScraperResponse()
		}

		// Return object with genres attached if it exists
		return this.includeGenres()
	}
}

export default StitchHelper
