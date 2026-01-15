/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('automation_scripts', table => {
      table.increments('id').primary().unique();
      table.string('name').notNullable();
      table.string('type').notNullable();
      table.text('content');
      table.text('path');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.index(['type']);
      table.index(['created_at']);
    })
    .createTable('automation_runs', table => {
      table.increments('id').primary().unique();
      table.integer('script_id').notNullable();
      table.integer('window_id').notNullable();
      table.string('status').notNullable();
      table.text('logs');
      table.timestamp('started_at');
      table.timestamp('finished_at');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table
        .foreign('script_id')
        .references('automation_scripts.id')
        .onDelete('CASCADE');
      table.foreign('window_id').references('window.id').onDelete('CASCADE');
      table.index(['script_id']);
      table.index(['window_id']);
      table.index(['status']);
      table.index(['created_at']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable('automation_runs').dropTable('automation_scripts');
};
