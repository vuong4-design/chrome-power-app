/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('proxy_health', table => {
      table.increments('id').primary();
      table.integer('proxy_id').notNullable().unique().references('id').inTable('proxy').onDelete('CASCADE');
      table.string('status').notNullable();
      table.integer('latency_ms').nullable();
      table.integer('http_status').nullable();
      table.string('geo_country').nullable();
      table.string('geo_region').nullable();
      table.string('geo_city').nullable();
      table.timestamp('checked_at').defaultTo(knex.fn.now());
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.index(['status']);
      table.index(['checked_at']);
    })
    .createTable('proxy_health_history', table => {
      table.increments('id').primary();
      table.integer('proxy_id').notNullable().references('id').inTable('proxy').onDelete('CASCADE');
      table.string('status').notNullable();
      table.integer('latency_ms').nullable();
      table.integer('http_status').nullable();
      table.string('geo_country').nullable();
      table.string('geo_region').nullable();
      table.string('geo_city').nullable();
      table.timestamp('checked_at').defaultTo(knex.fn.now());
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index(['proxy_id']);
      table.index(['checked_at']);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable('proxy_health_history').dropTable('proxy_health');
};
