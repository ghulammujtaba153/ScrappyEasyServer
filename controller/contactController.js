import Contact from '../models/Contact.js';
import { parse } from 'csv-parse/sync';

export async function getContacts(req, res, next) {
  try {
    const contacts = await Contact.find({ userId: req.user._id });
    res.json(contacts);
  } catch (err) {
    next(err);
  }
}

export async function createContact(req, res, next) {
  try {
    const { email, firstName, lastName, company, customFields } = req.body;
    const contact = await Contact.findOneAndUpdate(
      { userId: req.user._id, email },
      { firstName, lastName, company, customFields },
      { upsert: true, new: true }
    );
    res.status(201).json(contact);
  } catch (err) {
    next(err);
  }
}

export async function importCsv(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const records = parse(req.file.buffer.toString(), { columns: true, skip_empty_lines: true });
    
    if (records.length === 0) {
      return res.json({ imported: 0 });
    }

    const ops = records.map(row => ({
      updateOne: {
        filter: { userId: req.user._id, email: row.email || row.Email },
        update: {
          $set: {
            firstName: row.firstName || row.first_name || row.FirstName || row.First_Name || '',
            lastName:  row.lastName  || row.last_name  || row.LastName  || row.Last_Name  || '',
            company:   row.company   || row.Company    || '',
          },
        },
        upsert: true,
      },
    }));
    const result = await Contact.bulkWrite(ops);
    res.json({ imported: result.upsertedCount + result.modifiedCount });
  } catch (err) {
    next(err);
  }
}

export async function deleteContact(req, res, next) {
  try {
    await Contact.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({ message: 'Deleted' });
  } catch (err) {
    next(err);
  }
}
