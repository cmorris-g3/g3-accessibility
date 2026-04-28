<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class MakeUser extends Command
{
    protected $signature = 'g3:make-user
        {--name= : Full name}
        {--email= : Email address (used to log in)}
        {--password= : Password; if omitted, a random one is generated and printed}';

    protected $description = 'Create a dashboard user. Registration is disabled in this app, so this is the supported way to add users.';

    public function handle(): int
    {
        $name = (string) ($this->option('name') ?: $this->ask('Name'));
        $email = (string) ($this->option('email') ?: $this->ask('Email'));
        $passwordOpt = $this->option('password');

        $generated = false;
        if (! $passwordOpt) {
            $passwordOpt = Str::password(16, symbols: false);
            $generated = true;
        }

        $validator = Validator::make([
            'name' => $name,
            'email' => $email,
            'password' => $passwordOpt,
        ], [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
        ]);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }
            return self::FAILURE;
        }

        $user = User::create([
            'name' => $name,
            'email' => $email,
            'password' => $passwordOpt,
            'email_verified_at' => now(),
        ]);

        $this->newLine();
        $this->info("User created: {$user->name} <{$user->email}>");
        $this->line('  ID: '.$user->id);

        if ($generated) {
            $this->newLine();
            $this->warn('Generated password (shown ONCE — copy now):');
            $this->line('  '.$passwordOpt);
            $this->newLine();
            $this->line('Share this with the user over a secure channel and have them change it after first login.');
        }

        return self::SUCCESS;
    }
}
