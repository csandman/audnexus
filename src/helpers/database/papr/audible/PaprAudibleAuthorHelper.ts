import AuthorModel, { AuthorDocument } from '#config/models/Author'
import { isAuthorDocument, isAuthorProfile } from '#config/typing/checkers'
import {
	PaprAuthorDocumentReturn,
	PaprAuthorReturn,
	PaprAuthorSearch,
	PaprDeleteReturn
} from '#config/typing/papr'
import { AuthorProfile } from '#config/typing/people'
import { ParsedQuerystring } from '#config/typing/requests'
import getErrorMessage from '#helpers/utils/getErrorMessage'
import SharedHelper from '#helpers/utils/shared'
import {
	ErrorMessageCreate,
	ErrorMessageDelete,
	ErrorMessageNotFoundInDb,
	ErrorMessageUpdate,
	MessageNoSearchParams,
	NoticeUpdateAsin
} from '#static/messages'

const projectionWithoutDbFields = {
	_id: 0,
	createdAt: 0,
	updatedAt: 0
}

export default class PaprAudibleAuthorHelper {
	asin: string
	authorData!: AuthorProfile
	options: ParsedQuerystring

	constructor(asin: string, options: ParsedQuerystring) {
		this.asin = asin
		this.options = options
	}

	/**
	 * Inserts a new author into the DB
	 * using authorData from the constructor
	 */
	async create(): Promise<PaprAuthorReturn> {
		try {
			await AuthorModel.insertOne(this.authorData)
			return {
				data: (await this.findOneWithProjection()).data,
				modified: true
			}
		} catch (error) {
			const message = getErrorMessage(error)
			console.error(message)
			throw new Error(ErrorMessageCreate(this.asin, 'author'))
		}
	}

	/**
	 * Deletes an author from the DB
	 * using asin from the constructor
	 */
	async delete(): Promise<PaprDeleteReturn> {
		try {
			const deletedAuthor = await AuthorModel.deleteOne({
				asin: this.asin,
				$or: [{ region: { $exists: false } }, { region: this.options.region }]
			})
			return {
				data: deletedAuthor,
				modified: true
			}
		} catch (error) {
			const message = getErrorMessage(error)
			console.error(message)
			throw new Error(ErrorMessageDelete(this.asin, 'author'))
		}
	}

	/**
	 * Searches for authors in the DB using options.name
	 * Returns altered Documents using projection.
	 */
	async findByName(): Promise<PaprAuthorSearch> {
		if (!this.options.name) {
			throw new Error(MessageNoSearchParams)
		}
		// Use projection search from mongo until papr implements it natively.
		// https://github.com/plexinc/papr/issues/98
		const found = await AuthorModel.find(
			{ $text: { $search: this.options.name } },
			{
				projection: { _id: 0, asin: 1, name: 1 },
				limit: 25,
				sort: { score: { $meta: 'textScore' } }
			}
		)

		return {
			data: found,
			modified: false
		}
	}

	/**
	 * Finds an author in the DB
	 * using asin from the constructor.
	 * Returns unaltered Document.
	 */
	async findOne(): Promise<PaprAuthorDocumentReturn> {
		const findOneAuthor = await AuthorModel.findOne({
			asin: this.asin,
			$or: [{ region: { $exists: false } }, { region: this.options.region }]
		})

		// Assign type to author data
		const data: AuthorDocument | null = isAuthorDocument(findOneAuthor) ? findOneAuthor : null

		return {
			data: data,
			modified: false
		}
	}

	/**
	 * Finds an author in the DB
	 * using asin from the constructor.
	 * Returns altered Document using projection.
	 */
	async findOneWithProjection(): Promise<PaprAuthorReturn> {
		const findOneAuthor = await AuthorModel.findOne(
			{
				asin: this.asin,
				$or: [{ region: { $exists: false } }, { region: this.options.region }]
			},
			{ projection: projectionWithoutDbFields }
		)

		// Assign type to author data
		const data: AuthorProfile | null = isAuthorProfile(findOneAuthor) ? findOneAuthor : null

		return {
			data: data,
			modified: false
		}
	}

	/**
	 * Set authorData in the class object
	 */
	setAuthorData(authorData: AuthorProfile) {
		this.authorData = authorData
	}

	/**
	 * Creates an author if it doesn't exist.
	 *
	 * Updates an existing author if:
	 *
	 * 1. `options.update` is 1 and the author exists
	 * 2. The incoming data is different from the existing data
	 * 3. Genres exist or are different
	 */
	async createOrUpdate(): Promise<PaprAuthorReturn> {
		const sharedHelper = new SharedHelper()
		const findInDb = await this.findOneWithProjection()

		// Update
		if (this.options.update === '1' && findInDb.data) {
			const data = findInDb.data
			// If the objects are the exact same return right away
			const isEqual = sharedHelper.isEqualData(data, this.authorData)
			if (isEqual) {
				return {
					data: data,
					modified: false
				}
			}
			// Check state of existing author
			// Only update if either genres exist and can be checked
			// -or if genres exist on new item but not old
			if (data.genres || (!data.genres && this.authorData.genres)) {
				// Only update if it's not nuked data
				if (this.authorData.genres?.length) {
					console.log(NoticeUpdateAsin(this.asin, 'author'))
					// Update
					return this.update()
				}
			}
			// No update performed, return original
			return findInDb
		}

		// Create
		return this.create()
	}

	/**
	 * Updates an author in the DB
	 * using asin from the constructor.
	 * Always sets createdAt and updatedAt fields.
	 * Returns altered Document using findOneWithProjection.
	 */
	async update(): Promise<PaprAuthorReturn> {
		try {
			const found = await this.findOne()
			if (!found.data) {
				throw new Error(ErrorMessageNotFoundInDb(this.asin, 'Author'))
			}
			await AuthorModel.updateOne(
				{ asin: this.asin, $or: [{ region: { $exists: false } }, { region: this.options.region }] },
				{
					$set: { ...this.authorData, createdAt: found.data._id.getTimestamp() },
					$currentDate: { updatedAt: true }
				}
			)
			// After updating, return with specific projection
			const updatedAuthor = await this.findOneWithProjection()
			// Set modified to true to indicate that the data has been updated
			updatedAuthor.modified = true
			return updatedAuthor
		} catch (error) {
			const message = getErrorMessage(error)
			console.error(message)
			throw new Error(ErrorMessageUpdate(this.asin, 'author'))
		}
	}
}
