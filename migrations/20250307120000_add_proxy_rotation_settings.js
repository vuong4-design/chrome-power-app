/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .alterTable('group', table => {
      table.boolean('auto_rotate_proxy').defaultTo(false);
      table.string('proxy_rotation_strategy').defaultTo('round_robin');
    })
    .alterTable('window', table => {
      table.boolean('auto_rotate_proxy').defaultTo(false);
      table.string('proxy_rotation_strategy').defaultTo('round_robin');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema
    .alterTable('window', table => {
      table.dropColumn('auto_rotate_proxy');
      table.dropColumn('proxy_rotation_strategy');
    })
    .alterTable('group', table => {
      table.dropColumn('auto_rotate_proxy');
      table.dropColumn('proxy_rotation_strategy');
    });
};
